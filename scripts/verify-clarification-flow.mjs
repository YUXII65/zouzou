/**
 * 澄清到计划的端到端验证。
 *
 * 先启动本地服务，然后创建临时用户，通过真实 HTTP 路由走完整链路：
 * 创建收件箱想法 -> 逐轮澄清 -> 生成计划 -> 确认保存任务
 * -> 检查 methodHint 落库 -> 删除临时用户。
 *
 * 用法：
 *   pnpm start
 *   pnpm verify:clarify-flow
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, issueSessionToken } from "@/lib/session";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
const content =
  "我想做一个个人网站，可能是作品集也可能是博客，还没想清楚，但想尽快有个能展示的东西。";

const user = await prisma.user.create({
  data: {
    username: `verify_${Date.now()}`,
    passwordHash: "verify:not-for-login",
  },
  select: { id: true },
});

const token = issueSessionToken(user.id);
const cookie = `${SESSION_COOKIE}=${token}`;

async function readNdjson(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  let last = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.message || "stream_error");
    if (event.type === "done") last = event.result;
  }
  if (!last || typeof last !== "object") {
    throw new Error("NDJSON 流里没有 done result");
  }
  return last;
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  return readNdjson(response);
}

async function getHtml(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Cookie: cookie },
  });
  if (!response.ok) {
    throw new Error(`GET ${pathname} -> HTTP ${response.status}`);
  }
  return response.text();
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

try {
  const first = await post("/api/ai/inbox/clarify", {
    mode: "socratic",
    content,
  });
  let clarification = first.clarification;
  const itemId = first.itemId;

  if (!clarification?.translation?.normalizedIntent) {
    throw new Error("首轮澄清没有先完成语言翻译");
  }
  if (!clarification?.frame?.coreNeedHypothesis) {
    throw new Error("首轮澄清没有形成 coreNeedHypothesis");
  }
  if (
    clarification?.status !== "asking" ||
    !clarification?.history?.some((item) => !item.answer.length)
  ) {
    throw new Error("首轮必须保留一次提问");
  }

  for (let turn = 0; turn < 4 && clarification.status === "asking"; turn += 1) {
    const current = clarification.history?.find((item) => !item.answer.length);
    if (!current) throw new Error("澄清状态是 asking，但没有未回答的问题");
    const answer = current.options?.[0] ? [current.options[0]] : ["先做作品集"];
    const advanced = await post("/api/ai/inbox/clarify", {
      mode: "socratic",
      itemId,
      answer,
    });
    clarification = advanced.clarification;
  }

  if (clarification.status !== "done") {
    throw new Error(`澄清没有在 4 轮内收口，当前状态：${clarification.status}`);
  }
  if (!clarification.summary?.workingAssumption) {
    throw new Error("澄清结束时没有 workingAssumption");
  }

  const plan = await post("/api/ai/inbox/plan", { itemId });
  if (process.env.VERIFY_DEBUG) {
    console.log(JSON.stringify(plan, null, 2));
  }
  if (plan?.source === "heuristic_fallback") {
    throw new Error("计划落回了本地兜底，不能当作完整 AI 方案通过");
  }
  if (plan?.source === "agent_failed") {
    throw new Error("普通模式 Agent 链路失败，不能自动通过");
  }
  if (!plan?.tasks?.length) {
    throw new Error("计划没有生成任务");
  }
  if (plan?.agent) {
    const card = plan.userCard;
    if (!card?.understanding || !card?.firstAction || !card?.how || !card?.doneWhen) {
      throw new Error("普通模式 Agent 没有给用户完整行动卡");
    }
    if (/(?:可以选择|可选|二选一|看情况|根据情况|自行决定|自己决定|先比较|先调研)/.test(JSON.stringify(card))) {
      throw new Error("普通模式行动卡把选择推回给了用户");
    }
    if (Array.isArray(plan.agent.usedFacts) && plan.agent.usedFacts.length === 0) {
      throw new Error("普通模式 Agent 没有说明方案使用了哪条已确认事实");
    }
    if (plan.tasks.length > 6) {
      throw new Error("计划链生成任务太多（安全上限 6）：" + plan.tasks.length);
    }
  }

  const methodHint = plan?.tasks?.[0]?.methodHint?.trim() ?? "";
  if (!methodHint || methodHint.length < 12) {
    throw new Error(`计划没有生成可执行的 methodHint：${methodHint || "空"}`);
  }
  if (!plan?.reason || plan.reason.trim().length < 20) {
    throw new Error("计划没有生成有效的 reason，可能落回了本地兜底");
  }
  if (plan.tasks?.[0]?.title?.includes(content)) {
    throw new Error("计划标题直接复用了原输入，可能落回了本地兜底");
  }

  const persisted = await prisma.inboxItem.findUnique({
    where: { id: itemId },
    select: { aiPlanJson: true, aiSuggestionJson: true },
  });
  if (!persisted?.aiPlanJson?.includes("methodHint")) {
    throw new Error("计划没有把 methodHint 持久化到 aiPlanJson");
  }
  if (!persisted.aiSuggestionJson?.includes("coreNeedHypothesis")) {
    throw new Error("澄清没有把推进判断持久化到 aiSuggestionJson");
  }
  if (!persisted.aiSuggestionJson.includes('"translation"')) {
    throw new Error("澄清没有把语言翻译持久化到 aiSuggestionJson");
  }
  if (
    !persisted.aiSuggestionJson.includes('"modeJudgment"') ||
    !persisted.aiSuggestionJson.includes('"endStateType"')
  ) {
    throw new Error("澄清没有把完整模式判断持久化到 aiSuggestionJson");
  }
  if (!persisted.aiSuggestionJson.includes('"session"')) {
    throw new Error("澄清没有把 DecisionSession 持久化到 aiSuggestionJson");
  }
  if (!persisted.aiPlanJson.includes('"session"')) {
    throw new Error("计划没有把 DecisionSession 持久化到 aiPlanJson");
  }

  const confirmed = await postJson("/api/miniprogram/inbox/confirm", {
    itemId,
    projectName: plan.projectName,
    projectObjective: plan.projectObjective,
    projectMilestone: plan.projectMilestone,
    tasks: plan.tasks.map((task) => ({
      title: task.title,
      shortTitle: task.shortTitle,
      notes: task.notes,
      methodHint: task.methodHint,
      priority: task.priority,
      scheduledDate: task.scheduledDate,
      dueDate: task.dueDate,
    })),
  });
  if (!confirmed?.taskCount) {
    throw new Error("确认保存后没有生成任务");
  }
  const savedTask = await prisma.task.findFirst({
    where: { userId: user.id },
    select: { id: true, methodHint: true, projectId: true },
  });
  if (!savedTask?.methodHint) {
    throw new Error("任务保存成功，但 methodHint 没有落库");
  }
  const savedSticky = await prisma.taskStickyNote.findFirst({
    where: { userId: user.id },
    select: { nextStep: true, stepsJson: true },
  });
  if (!savedSticky?.nextStep || !savedSticky.stepsJson) {
    throw new Error("任务保存成功，但没有自动生成执行便利贴");
  }
  const homeHtmlAfterConfirm = await getHtml("/");
  if (
    homeHtmlAfterConfirm.includes('data-tour="clarify-options"') ||
    homeHtmlAfterConfirm.includes("有卡顿？说说想法")
  ) {
    throw new Error("确认后主页仍残留澄清卡片");
  }

  // 用户必须真的能在页面上看到这条执行链，而不只是躺在数据库里。
  // v3.3 起书桌并进文件页（/workspace 只是重定向），而且没指定文件夹时全部收起，
  // 任务和便利贴都不在 HTML 里。所以必须带着 project 参数打开对应文件夹再断言。
  const workspacePath = savedTask.projectId
    ? "/files?project=" + savedTask.projectId
    : "/files?view=unassigned";
  const workspaceHtml = await getHtml(workspacePath);
  if (!workspaceHtml.includes(savedSticky.nextStep)) {
    throw new Error("文件页没有渲染便利贴的 nextStep，用户看不到执行入口");
  }
  const steps = JSON.parse(savedSticky.stepsJson);
  const firstStep = Array.isArray(steps) ? String(steps[0] ?? "") : "";
  if (firstStep && !workspaceHtml.includes(firstStep)) {
    throw new Error("文件页没有渲染执行步骤，做法没有融进任务输出");
  }

  // 模糊输入：先补信息（可多问，但必须收口），收口后必须出路径
  const vague = "我想做点什么，但说不清，最近一直没什么头绪。";
  let vagueState = await post("/api/ai/inbox/clarify", {
    mode: "socratic",
    content: vague,
  });
  if (vagueState.clarification?.status !== "asking") {
    throw new Error("模糊输入没有触发澄清提问");
  }
  const vagueItemId = vagueState.itemId;
  const asked = [];
  for (
    let turn = 0;
    turn < 5 && vagueState.clarification?.status === "asking";
    turn += 1
  ) {
    const current = vagueState.clarification.history?.find(
      (item) => !item.answer.length,
    );
    if (!current?.question || !current.options?.length) {
      throw new Error("澄清提问没有给出问题或选项");
    }
    // 质量形状：首轮问题要具体、引用用户或当前处境；不再强制 A/B 取舍题。
    if (!/(?:你|这|那|哪|什么|最近|目前|现在)/.test(current.question)) {
      throw new Error(`澄清问题没有引用用户或当前处境：${current.question}`);
    }
    if (
      current.options.some(
        (option) =>
          typeof option !== "string" ||
          option.trim().length < 2 ||
          /看情况|其他|都行/.test(option),
      )
    ) {
      throw new Error(`澄清选项不合格：${current.options.join(" / ")}`);
    }
    asked.push(current.question);
    vagueState = await post("/api/ai/inbox/clarify", {
      mode: "socratic",
      itemId: vagueItemId,
      answer: [current.options[0]],
    });
  }
  if (vagueState.clarification?.status !== "done") {
    throw new Error("澄清没有收口，问得太久");
  }
  if (asked.length < 2) {
    throw new Error("澄清至少应进行两轮提问");
  }
  if (new Set(asked).size !== asked.length) {
    throw new Error("澄清重复问了同一个问题");
  }
  const vaguePlan = await post("/api/ai/inbox/plan", { itemId: vagueItemId });
  if (!vaguePlan?.tasks?.length) {
    throw new Error("补全信息后没有生成执行路径");
  }

  console.log("PASS clarify-e2e");
  console.log(`filesRender=nextStep+steps 可见（` + workspacePath + `）`);
  console.log(`frame=${clarification.frame?.coreNeedHypothesis}`);
  console.log(`plan=${plan?.tasks?.[0]?.title}`);
  console.log(`methodHint=${methodHint}`);
  console.log(`savedTasks=${confirmed.taskCount}`);
  console.log(`stickyNextStep=${savedSticky.nextStep}`);
  console.log(`askFlow=asked ${asked.length} -> ${vaguePlan.tasks[0].title}`);
} finally {
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
}
