import { toDateInputValue } from "@/lib/date";
import { after } from "next/server";
import { buildTaskContract } from "@/lib/task-contract";
import {
  estimateAiUsage,
  hasAiQuota,
  isAiQuotaEnabled,
  recordAiUsage,
} from "@/lib/ai-quota";

export type InboxPlanTask = {
  title: string;
  shortTitle: string;
  executionMode: string;
  doneWhen: string;
  maxTurns: number;
  toolPolicy: string;
  notes: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  scheduledDate: string | null;
  dueDate: string | null;
};

export type InboxPlan = {
  action: "create_project" | "existing_project" | "single_task" | "ignore";
  projectName: string | null;
  projectObjective: string | null;
  projectMilestone: string | null;
  tasks: InboxPlanTask[];
  reason: string;
};

export type FirstRunPlan = {
  projectName: string;
  objective: string;
  milestone: string;
  taskTitle: string;
  taskShortTitle: string;
  taskExecutionMode: string;
  taskDoneWhen: string;
  taskMaxTurns: number;
  taskToolPolicy: string;
};

export type FirstRunPlanResult = FirstRunPlan & {
  usedFallback: boolean;
};

export type InboxClarificationDimension = {
  key: string;
  question: string;
  options: string[];
  multi?: boolean;
};

export type InboxClarification = {
  dimensions: InboxClarificationDimension[];
  supplementPlaceholder: string;
};

export type InboxProjectContext = {
  name: string;
  objective: string | null;
  currentMilestone: string | null;
};

export type TaskEditSuggestion = {
  title?: string;
  shortTitle?: string;
  notes?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  scheduledDate?: string | null;
  dueDate?: string | null;
  focusDate?: string | null;
  reason: string;
};

export type ProjectEditSuggestion = {
  name?: string;
  objective?: string;
  currentMilestone?: string | null;
  status?: string;
  notes?: string | null;
  reason: string;
};

export type TaskCoachAdvice = {
  title: string;
  encouragement: string;
  steps: string[];
  nextStep: string;
};

export type TodaySuggestion = {
  taskId: string;
  title: string;
  projectName: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  reason: string;
  evidence: string[];
};

export type TaskShortTitleSuggestion = {
  shortTitle: string;
};

export type ReviewDraft = {
  summary: string;
  nextActions: string;
};

const OUTPUT_QUALITY_RULES = `
所有输出都必须先理解用户当前的真实处境，再决定内容和语气。
- 同一个问题可以因为用户处境不同而有完全不同的回答，不能只替换任务名、对象名或几个词。
- 不要默认输出“先确认一个最小路径”“先看到一个具体成果”“先做最小下一步”这类固定动作。
- 不要用“我大概知道你真正看重什么了”“接下来不再套标准流程”“我会顺着这句话”这类开场，也不要每轮都先肯定用户再给出方案；直接进入具体的判断。
- 总结和认可要基于用户这一轮说出的具体内容，不要堆关键词，也不要把用户最后选的选项原样复述一遍当作理解。
- 目标和里程碑必须写清对象、范围和可检查的结果，禁止“初版”“最小一步”“先确认方向”这类空泛说法。
- 不要反复使用“不是 A 而是 B”“今天真正推进的是”“价值在于”“意味着”“本质上”“首先/其次/总之”等模板句。
- 原因、建议和总结必须引用用户输入里的具体细节或变化，不能写通用鼓励和空泛判断。
- 任务、行动和结论要说清楚对象、动作或判断依据，避免项目管理腔和 AI 讲义腔。
- 保持自然、直接、像人说话；长度和结构随内容变化，不要每次同一套句式。
`.trim();

type FocusTask = {
  id: string;
  title: string;
  projectName: string | null;
  priority: string;
  dueDate: Date | null;
  scheduledDate: Date | null;
};

const priorities = ["low", "medium", "high", "urgent"] as const;
const planActions = [
  "create_project",
  "existing_project",
  "single_task",
  "ignore",
] as const;

function firstLine(content: string) {
  return content.split(/\r?\n/)[0]?.trim() || content.slice(0, 80);
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function safePriority(value: unknown) {
  return priorities.includes(value as (typeof priorities)[number])
    ? (value as (typeof priorities)[number])
    : "medium";
}

function safePlanAction(value: unknown) {
  return planActions.includes(value as (typeof planActions)[number])
    ? (value as (typeof planActions)[number])
    : "single_task";
}

function safePlanTask(value: unknown): InboxPlanTask {
  if (!value || typeof value !== "object") {
    return {
      title: "待整理任务",
      shortTitle: "整理任务",
      executionMode: "quick",
      doneWhen: "拿到可以直接使用的答案或结果",
      maxTurns: 1,
      toolPolicy: "none",
      notes: null,
      priority: "medium",
      scheduledDate: null,
      dueDate: null,
    };
  }

  const raw = value as Record<string, unknown>;
  const today = toDateInputValue(new Date());
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 200)
      : "待整理任务";
  const notes =
    typeof raw.notes === "string" && raw.notes.trim()
      ? raw.notes.trim().slice(0, 500)
      : null;
  const contract = buildTaskContract(`${title} ${notes ?? ""}`, title);
  return {
    title,
    shortTitle: normalizeShortTitle(raw.shortTitle, title),
    executionMode:
      typeof raw.executionMode === "string" && raw.executionMode.trim()
        ? raw.executionMode.trim()
        : contract.executionMode,
    doneWhen:
      typeof raw.doneWhen === "string" && raw.doneWhen.trim()
        ? raw.doneWhen.trim().slice(0, 200)
        : contract.doneWhen,
    maxTurns:
      typeof raw.maxTurns === "number" && raw.maxTurns > 0
        ? Math.min(Math.floor(raw.maxTurns), 5)
        : contract.maxTurns,
    toolPolicy:
      typeof raw.toolPolicy === "string" && raw.toolPolicy.trim()
        ? raw.toolPolicy.trim()
        : contract.toolPolicy,
    notes,
    priority: safePriority(raw.priority),
    scheduledDate:
      typeof raw.scheduledDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.scheduledDate) &&
      raw.scheduledDate >= today
        ? raw.scheduledDate
        : null,
    dueDate:
      typeof raw.dueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) &&
      raw.dueDate >= today
        ? raw.dueDate
        : null,
  };
}

type CallModelOptions = {
  onDelta?: (delta: string) => void;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  maxTokens?: number;
};

type ChatCompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

type ChatCompletionPayload = {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
  usage?: ChatCompletionUsage;
};

async function readStreamingContent(
  response: Response,
  onDelta: (delta: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) return { content: "", usage: undefined };

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: ChatCompletionUsage | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payloadText = line.slice(5).trim();
      if (!payloadText || payloadText === "[DONE]") continue;

      try {
        const payload = JSON.parse(payloadText) as ChatCompletionPayload;
        const delta = payload.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          content += delta;
          onDelta(delta);
        }
        if (payload.usage) usage = payload.usage;
      } catch {
        // Some compatible providers send keep-alive data that is not JSON.
      }
    }
  }

  return { content, usage };
}

async function callModel(
  system: string,
  user: string,
  apiKeyOverride?: string,
  modelOverride?: string,
  baseUrlOverride?: string,
  temperatureOverride = 0.2,
  options: CallModelOptions = {},
) {
  const apiKey =
    apiKeyOverride ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model =
    modelOverride ||
    process.env.DEEPSEEK_MODEL ||
    process.env.OPENAI_MODEL ||
    "deepseek-v4-flash";
  const baseUrl = (
    baseUrlOverride ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com"
  ).replace(/\/$/, "");

  const startedAt = Date.now();
  const totalBudgetMs = 26_000;
  let streamed = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (isAiQuotaEnabled() && !(await hasAiQuota())) return null;

    // 超过总预算就不再重试，避免按钮长时间停在“处理中”。
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    if (remaining <= 2_000) return null;

    try {
      const shouldStream = Boolean(options.onDelta);
      const useDeepSeekReasoningControl =
        /deepseek/i.test(model) || /deepseek/i.test(baseUrl);
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `${system}\n\n${OUTPUT_QUALITY_RULES}` },
            { role: "user", content: user },
          ],
          temperature: temperatureOverride,
          ...(useDeepSeekReasoningControl
            ? { reasoning_effort: options.reasoningEffort ?? "none" }
            : {}),
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(shouldStream
            ? {
                stream: true,
                stream_options: { include_usage: true },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(Math.min(20_000, remaining)),
      });

      if (!response.ok) {
        console.warn(`[ai] request failed with ${response.status}`);
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt === 0 &&
          totalBudgetMs - (Date.now() - startedAt) > 6_000
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        return null;
      }

      const streamedResponse = shouldStream
        ? await readStreamingContent(response, (delta) => {
            streamed = true;
            options.onDelta?.(delta);
          })
        : null;
      const data = streamedResponse
        ? null
        : ((await response.json()) as ChatCompletionPayload);
      const content =
        streamedResponse?.content ??
        data?.choices?.[0]?.message?.content ??
        null;
      const responseUsage = streamedResponse?.usage ?? data?.usage;

      const usage = responseUsage
        ? {
            promptTokens: responseUsage.prompt_tokens ?? 0,
            completionTokens: responseUsage.completion_tokens ?? 0,
            totalTokens: responseUsage.total_tokens ?? 0,
            promptCacheHitTokens: responseUsage.prompt_cache_hit_tokens ?? null,
            promptCacheMissTokens: responseUsage.prompt_cache_miss_tokens ?? null,
            model,
          }
        : await estimateAiUsage({ system, user }, content);
      after(() => recordAiUsage(usage));

      console.info(
        `[ai] model=${model} stream=${shouldStream ? "yes" : "no"} total=${Date.now() - startedAt}ms`,
      );
      return content;
    } catch (error) {
      console.warn("[ai] request error", error);
      if (
        !streamed &&
        attempt === 0 &&
        totalBudgetMs - (Date.now() - startedAt) > 6_000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      return null;
    }
  }

  return null;
}

function heuristicPlan(content: string, projectNames: string[]): InboxPlan {
  const lower = content.toLowerCase();
  const projectName =
    projectNames.find((name) => lower.includes(name.toLowerCase())) ?? null;

  if (/(忽略|不用处理|删除|暂时不要)/.test(lower)) {
    return {
      action: "ignore",
      projectName,
      projectObjective: null,
      projectMilestone: null,
      tasks: [],
      reason: "本地规则：内容包含忽略类关键词",
    };
  }

  const first = firstLine(content);
  const short = first.length > 24 ? `${first.slice(0, 24)}…` : first;
  const taskTitle = /卡|难|累|焦虑|压力|害怕|不确定|迷茫|拖延|没时间/.test(
    lower,
  )
    ? `把「${short}」最卡的一处说清楚`
    : /用户|需求|反馈|市场|聊天|访谈|验证/.test(lower)
      ? `围绕「${short}」拿到一次真实反馈`
      : /写|作品|网站|产品|发布|上线|原型|创作/.test(lower)
        ? `做出「${short}」一个看得见的粗糙版本`
        : /学习|学|考试|复习|练习/.test(lower)
          ? `用 25 分钟处理「${short}」最难的一小块`
          : `让「${short}」今天出现一个看得见的变化`;
  const contract = buildTaskContract(content, taskTitle);

  return {
    action: projectName ? "existing_project" : "single_task",
    projectName,
    projectObjective: null,
    projectMilestone: null,
    tasks: [
      {
        title: taskTitle,
        shortTitle: normalizeShortTitle(null, taskTitle),
        executionMode: contract.executionMode,
        doneWhen: contract.doneWhen,
        maxTurns: contract.maxTurns,
        toolPolicy: contract.toolPolicy,
        notes: first,
        priority:
          /(紧急|尽快|今天|立刻)/.test(lower)
            ? "high"
            : "medium",
        scheduledDate: null,
        dueDate: null,
      },
    ],
    reason: projectName
      ? "本地规则：AI 暂不可用，先按当前项目方向生成一个具体动作"
      : "本地规则：AI 暂不可用，先按这句话生成一个具体动作",
  };
}

function normalizeShortTitle(value: unknown, fallbackTitle: string) {
  const candidate =
    typeof value === "string" && value.trim()
      ? value.trim().replace(/[“”"「」]/g, "")
      : fallbackTitle.trim();
  const cleaned = candidate
    .replace(/^(?:今天|明天|本周|这周|接下来|然后|需要|请)\s*/u, "")
    .replace(/^(?:花|用)\s*\d+\s*(?:分钟|小时)\s*/u, "")
    .replace(/^只(?:做|要)\s*/u, "")
    .trim();
  const compact =
    cleaned.split(/[：:]/).filter(Boolean).at(-1)?.split(/[，,。；;！？!?]/)[0]?.trim() ||
    cleaned;

  return compact.length > 18 ? `${compact.slice(0, 17).trim()}…` : compact;
}

function heuristicFirstRun(content: string): FirstRunPlan {
  const clean = content.trim().replace(/\s+/g, " ");
  const short = clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
  const topic =
    clean
      .replace(/^(?:我?想(?:做|要|把|开始|尝试|搞)?|做(?:个|一个)?|搞(?:个|一个)?)/, "")
      .split(/[，。！？,.!?\n]/)[0]
      .trim() || short;
  const isBlocked =
    /卡|难|累|焦虑|压力|害怕|不确定|迷茫|拖延|没时间/.test(clean);
  const isValidation = /用户|需求|反馈|市场|聊天|访谈|验证|选型|方案/.test(
    clean,
  );
  const isCreation = /写|作品|网站|产品|发布|上线|原型|创作/.test(clean);
  const isLearning = /学习|学|考试|复习|练习/.test(clean);
  const isKnowledge = /笔记|读书|阅读|知识|资料|摘录|书里|看过的书/.test(clean);
  const isEvent = /组织|活动|大家|预算|参与者|群|聚会|旅行|徒步/.test(clean);
  const isFamilyHealth = /父母|爸妈|家人|体检|健康|医院|医生/.test(clean);
  const isRelationship = /室友|同事|朋友|伴侣|沟通|关系|边界/.test(clean);
  const isChoice = /考研|换城市|转行|选择|取舍|要不要|犹豫/.test(clean);
  const isHome = /整理|收纳|房间|台面|衣柜|家里|收拾/.test(clean);
  const isFinance = /存钱|预算|记账|支出|储蓄|理财/.test(clean);
  const taskTitle = isKnowledge
    ? `选一本读过的书，整理 3 个还能记起、也愿意复用的观点`
    : isFamilyHealth
    ? `给家人打一次电话，问清他们对体检的具体顾虑`
    : isRelationship
      ? `写下最近三次具体事实，并准备一次简短沟通`
      : isChoice
        ? `写下这次选择最在意的 3 个判断标准`
        : isHome
          ? `先处理一个最影响日常的小区域`
          : isFinance
            ? `把最近一个月固定支出列出来`
    : isBlocked
    ? `把「${topic}」里最卡的一处写成一句话`
    : isValidation
      ? `找一个可能相关的人，问一个关于「${topic}」的具体问题`
      : isCreation
        ? `给「${topic}」做出一个能看见轮廓的粗糙版本`
        : isLearning
          ? `用 25 分钟攻下「${topic}」里最难的一小块`
          : `为「${topic}」留下一个 30 分钟内看得见的进展`;
  const taskShortTitle = normalizeShortTitle(null, taskTitle);
  const taskContract = buildTaskContract(clean, taskTitle);
  const objective = isKnowledge
    ? "把读过的书里真正有用的观点整理成一份以后能查、能复用的笔记。"
    : isFamilyHealth
    ? "把家人对体检的顾虑和现实安排理清，先形成一次能执行的沟通和检查计划。"
    : isRelationship
      ? "把反复出现的摩擦说清楚，形成一条双方都能执行的约定。"
      : isChoice
        ? "把选择标准和现实条件对齐，再决定需要补哪一条关键信息。"
        : isHome
          ? "让空间重新变得顺手，并把整理控制在能持续维护的范围。"
          : isFinance
            ? "把现金流的真实情况看清，再决定从哪里开始调整。"
    : isValidation
    ? "把模糊想法整理成一条可验证的实现路径，先判断什么值得继续投入。"
      : isBlocked
      ? "先看清真正卡住的地方，再把负担缩小到可以重新开始。"
      : isCreation
        ? "先做出一个真实的人能看到、能直接指出哪里不行的版本，再决定下一轮改什么。"
        : isLearning
          ? "把学习目标落到一个真实场景，并建立可以重复的练习节奏。"
          : isEvent
            ? "把分散的参与者、时间和限制收成一个能够执行的默认方案。"
            : "先弄清这件事最想解决的问题，再选一个今天就能动手、也能看出结果的方向。";
  const milestone = isKnowledge
    ? "完成一页包含 3 个观点和对应使用场景的读书笔记"
    : isFamilyHealth
    ? "确认家人愿意讨论的顾虑，并选出一项最值得先推进的检查"
    : isRelationship
      ? "完成一次不互相指责的沟通，并确认一条具体约定"
      : isChoice
        ? "得到一条能真正改变判断的新信息"
        : isHome
          ? "让一个高频使用区域恢复顺手，并能维持一周"
          : isFinance
            ? "看清固定支出结构，并确定一个可执行的调整项"
    : isValidation
    ? "得到一条能判断方向是否成立的真实反馈"
      : isBlocked
      ? "明确一个可移除的阻力，并重新开始推进"
      : isCreation
        ? "有一个真实的人看过这版，并指出至少一处具体问题"
        : isLearning
          ? "完成一次练习，并能对出错的地方说清原因"
          : isEvent
            ? "锁定日期、预算和负责人"
            : "选出一个今天能动手、也看得出结果的方向";

  return {
    projectName: topic.slice(0, 10),
    objective,
    milestone,
    taskTitle,
    taskShortTitle,
    taskExecutionMode: taskContract.executionMode,
    taskDoneWhen: taskContract.doneWhen,
    taskMaxTurns: taskContract.maxTurns,
    taskToolPolicy: taskContract.toolPolicy,
  };
}

function heuristicClarification(
  content: string,
  projectNames: string[],
): InboxClarification {
  const projectName =
    projectNames.find((name) => content.includes(name)) ?? null;
  const hasAny = (...words: string[]) =>
    words.some((word) => content.includes(word));

  if (projectName) {
    return {
      dimensions: [
        {
          key: "signal",
          question: `对“${projectName}”来说，什么样的进展会让你觉得值得继续？`,
          options: [
            "有人愿意用或给反馈",
            "有一个能拿出手的成果",
            "自己终于进入了稳定节奏",
          ],
        },
        {
          key: "friction",
          question: "现在最不顺手的地方是什么？",
          options: [
            "方向还不清楚",
            "总被别的事挤掉",
            "一做就想做到很完整",
          ],
        },
        {
          key: "support",
          question: "这时你更希望走走怎么帮你？",
          options: [
            "把范围收小到能动手",
            "把下一步说得足够具体",
            "先陪我理清真正卡在哪",
          ],
        },
      ],
      supplementPlaceholder: `如果你觉得这些都不准确，可以补充两句，例如“我想用 ${projectName} 完成一个具体结果”。`,
    };
  }

  if (
    hasAny(
      "卡",
      "难",
      "累",
      "焦虑",
      "压力",
      "害怕",
      "不确定",
      "迷茫",
      "拖延",
      "没时间",
      "忙",
    )
  ) {
    return {
      dimensions: [
        {
          key: "friction",
          question: "现在最卡你的是什么？",
          options: [
            "不知道从哪儿动手",
            "时间总被别的事挤掉",
            "一想到要做完整就累",
          ],
        },
        {
          key: "energy",
          question: "你眼下能腾出的精力有多少？",
          options: [
            "十分钟，只想先动一下",
            "半小时，能认真做一小块",
            "周末再集中处理",
          ],
        },
        {
          key: "support",
          question: "哪种帮助对你最有用？",
          options: [
            "把范围缩小到能开始",
            "直接把下一步写具体",
            "先陪我理清为什么卡住",
          ],
        },
      ],
      supplementPlaceholder:
        "也可以直接说说：什么最耗你，或者你希望今天结束时有什么变化。",
    };
  }

  if (
    hasAny("验证", "用户", "需求", "反馈", "市场", "别人", "聊天", "访谈")
  ) {
    return {
      dimensions: [
        {
          key: "uncertainty",
          question: "你现在最想先弄清哪件事？",
          options: [
            "有没有人真的需要",
            "哪种做法更有人愿意接受",
            "这件事值不值得继续投入",
          ],
        },
        {
          key: "feedback",
          question: "谁最可能给你有用反馈？",
          options: [
            "已经遇到这个问题的人",
            "做过类似事情的人",
            "身边愿意直说的朋友",
          ],
        },
        {
          key: "signal",
          question: "什么样的回应会让你愿意继续？",
          options: [
            "有人主动追问细节",
            "有人愿意试用或预约",
            "有人指出一个真实痛点",
          ],
        },
      ],
      supplementPlaceholder:
        "也可以写下你目前最没底的那个判断，我会围绕它来问你。",
    };
  }

  if (
    hasAny("学习", "学", "考试", "习惯", "坚持", "复习", "读书", "练习")
  ) {
    return {
      dimensions: [
        {
          key: "progress",
          question: "这次你更想要哪种进展？",
          options: [
            "把难的地方弄懂",
            "形成不容易断的节奏",
            "做出一次能检查的结果",
          ],
        },
        {
          key: "interruption",
          question: "最容易打断你的是什么？",
          options: [
            "不知道每天从哪儿开始",
            "状态一差就容易停",
            "内容太多，总想重头整理",
          ],
        },
        {
          key: "rhythm",
          question: "哪种推进方式更像你？",
          options: [
            "每天固定一小段",
            "一周集中几次",
            "按状态灵活安排",
          ],
        },
      ],
      supplementPlaceholder:
        "如果你愿意，也可以说说最近一次没坚持下来的原因。",
    };
  }

  if (
    hasAny("写", "作品", "网站", "产品", "发布", "上线", "原型", "整理", "创作")
  ) {
    return {
      dimensions: [
        {
          key: "audience",
          question: "你希望谁最先看到它？",
          options: [
            "先给自己看，确认方向",
            "给少数目标用户看",
            "直接公开发布",
          ],
        },
        {
          key: "shape",
          question: "这一次你想先做出什么形态？",
          options: [
            "能看到轮廓的草稿",
            "能实际使用的版本",
            "一小块最关键的体验",
          ],
        },
        {
          key: "bottleneck",
          question: "现在最影响推进的是什么？",
          options: [
            "内容还没想清楚",
            "做起来太费时间",
            "总在细节里打转",
          ],
        },
      ],
      supplementPlaceholder:
        "也可以说说你希望它先解决谁的什么问题，我会据此继续问你。",
    };
  }

  return {
    dimensions: [
      {
        key: "change",
        question: "这件事做成后，你最想看到什么变化？",
        options: [
          "不再只是想着，开始有真实进展",
          "有一个能给别人看的成果",
          "找回持续推进的手感",
        ],
      },
      {
        key: "friction",
        question: "现在最不顺手的地方是什么？",
        options: [
          "不知道怎么开始",
          "做到一半容易停下",
          "选择太多，定不下来",
        ],
      },
      {
        key: "support",
        question: "哪种开始方式更像你？",
        options: [
          "给我一个明确动作",
          "先陪我把思路聊清",
          "先看看别人怎么做",
        ],
      },
    ],
    supplementPlaceholder:
      "如果这些都不太准，可以直接说说你真正在意什么，我会顺着你的话来问。",
  };
}

export async function clarifyInbox(
  content: string,
  projectNames: string[],
  apiKey?: string,
  model?: string,
  baseUrl?: string,
  projectContext?: InboxProjectContext[],
  memorySummary?: string,
  evidence?: string[],
  onDelta?: (delta: string) => void,
) {
  const fallback = heuristicClarification(content, projectNames);
  const text = await callModel(
    `你是走走里的推进伙伴，不是问卷生成器。用户会输入一个真实想法，你要像认真聊天一样，先找到此刻最值得弄清的 2-4 个维度，再给每个维度 3 个能直接点击的具体选项。
要求：
- 从用户原话和上下文出发，不要固定套用“结果、优先级、第一步”这类模板。
- 不要每道题都围着“最小行动”转。可根据内容选择：真正在意什么变化、担心什么、有哪些现实限制、能调动什么资源、谁能给反馈、什么信号算值得继续、当前最卡在哪、什么节奏更适合。
- 问题和选项要口语化、有区分度，避免项目管理腔，避免三道题都像是同一种问法。
- 每道题尽量让用户更容易说真话，而不是被逼着选一个标准答案。
- 只返回 JSON，不要 Markdown。格式：{"dimensions":[{"key":"维度标识","question":"简短问题","options":["3个简单选项"]}],"supplementPlaceholder":"补充框提示语"}。`,
    JSON.stringify({
      content,
      projectNames,
      projects: projectContext ?? [],
      memorySummary: memorySummary ?? null,
      contextEvidence: evidence ?? [],
    }),
    apiKey,
    model,
    baseUrl,
    0.7,
    { onDelta, maxTokens: 1200 },
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(
      extractJson(text) ?? "{}",
    ) as Record<string, unknown>;
    const rawDimensions = Array.isArray(raw.dimensions)
      ? raw.dimensions
      : raw.question && Array.isArray(raw.options)
        ? [
            {
              key: "direction",
              question: raw.question,
              options: raw.options,
            },
          ]
        : [];
    const dimensions = rawDimensions
      .filter(
        (dimension): dimension is InboxClarificationDimension =>
          Boolean(dimension) &&
          typeof dimension === "object" &&
          typeof dimension.question === "string" &&
          Array.isArray(dimension.options),
      )
      .map((dimension) => ({
        key:
          typeof dimension.key === "string" && dimension.key.trim()
            ? dimension.key.trim()
            : `dimension-${Math.random().toString(36).slice(2, 7)}`,
        question: dimension.question.trim().slice(0, 200),
        options: dimension.options
          .filter(
            (option): option is string =>
              typeof option === "string" && option.trim().length > 0,
          )
          .slice(0, 3)
          .map((option) => option.trim().slice(0, 100)),
      }))
      .filter((dimension) => dimension.question && dimension.options.length)
      .slice(0, 4);

    return {
      dimensions: dimensions.length ? dimensions : fallback.dimensions,
      supplementPlaceholder:
        typeof raw.supplementPlaceholder === "string" &&
        raw.supplementPlaceholder.trim()
          ? raw.supplementPlaceholder.trim()
          : fallback.supplementPlaceholder,
    };
  } catch {
    return fallback;
  }
}

export async function planInbox(
  content: string,
  projectNames: string[],
  apiKey?: string,
  model?: string,
  baseUrl?: string,
  direction?: string,
  supplement?: string,
  projectContext?: InboxProjectContext[],
  memorySummary?: string,
  dimensionChoices?: string[],
  evidence?: string[],
  maxTasks?: number,
  onDelta?: (delta: string) => void,
) {
  const clarifiedContent = [content, direction, supplement]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n");
  const fallback = heuristicPlan(clarifiedContent, projectNames);

  const text = await callModel(
    `你是走走里的推进伙伴，不是标准计划工具。用户会输入一个真实想法。先理解他为什么想做、现实限制和节奏，再判断此刻最适合哪种推进方式。
要求：
- 推进方式按情境变化：获取真实反馈、做出可见产出、做关键取舍、排除一个卡点、完成学习练习、整理材料，或建立低摩擦节奏。不要一律生成“最小第一步”。
- projectMilestone 写当前阶段值得看到的具体进展，不固定叫“最小成果”。
- tasks 为 1-5 条，每项包含 title、shortTitle、executionMode、doneWhen、maxTurns、toolPolicy、notes、priority、scheduledDate、dueDate；title 是完整、具体的执行动作；shortTitle 是供列表展示的语义标题，4-12 个字，不能直接截取 title 开头。
- executionMode 只能是 quick、tool、produce、explore、project；能一次完成的任务用 quick，需要最新外部信息的用 tool，需要产出的用 produce，需要验证的用 explore，只有长期目标才用 project。
- doneWhen 必须写清什么结果算完成；maxTurns 为 quick=1、tool/produce=2、explore/project=3；toolPolicy 只能是 none、read、confirm-write。
- shortTitle 要保留任务之间最关键的差异，例如“验证国内替代方案”“注册 Atypica 跑通流程”“整理首批用户反馈”，不要写成“推进任务”“执行第一步”这类空泛标题。
- 首条任务要具体、当天或明天能开始，通常 10-45 分钟，不要总以“先”字开头，不要出现“最小下一步、完成最小、第一步”等模板口号。
- 如果用户提到卡住、没时间或想法太多，可以缩小范围、减少任务，但仍要说清楚具体做什么，而不是只写“思考一下”或“整理思路”。
- projectObjective 要保留用户想做这件事的真实意义，避免每句都写“持续推进、形成闭环”。
- reason 要像朋友解释为什么这样安排，必须引用用户原话或 contextEvidence 中的真实依据。
- 日期格式是 YYYY-MM-DD 或 null。所有日期必须基于输入中的 currentDate。如果 maxTasks 存在，任务数量必须小于或等于 maxTasks。
- 只返回 JSON，不要 Markdown。字段：action 必须是 create_project、existing_project、single_task、ignore 之一；projectName 只能从给定项目中选择，若新建项目则给一个简洁名称，不要叫“XX计划”。`,
    JSON.stringify({
      currentDate: toDateInputValue(new Date()),
      content: clarifiedContent,
      projectNames,
      projects: projectContext ?? [],
      memorySummary: memorySummary ?? null,
      dimensionChoices: dimensionChoices ?? [],
      contextEvidence: evidence ?? [],
      maxTasks: maxTasks ?? null,
    }),
    apiKey,
    model,
    baseUrl,
    0.65,
    { onDelta, maxTokens: 1600 },
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<InboxPlan>;
    const tasks = Array.isArray(raw.tasks)
      ? raw.tasks.map(safePlanTask).slice(0, maxTasks ?? 5)
      : fallback.tasks;
    const action = safePlanAction(raw.action);

    return {
      action,
      projectName:
        typeof raw.projectName === "string" && raw.projectName.trim()
          ? raw.projectName.trim().slice(0, 120)
          : fallback.projectName,
      projectObjective:
        typeof raw.projectObjective === "string" && raw.projectObjective.trim()
          ? raw.projectObjective.trim().slice(0, 500)
          : fallback.projectObjective,
      projectMilestone:
        typeof raw.projectMilestone === "string" && raw.projectMilestone.trim()
          ? raw.projectMilestone.trim().slice(0, 200)
          : fallback.projectMilestone,
      tasks: tasks.length ? tasks : fallback.tasks,
      reason:
        typeof raw.reason === "string" && raw.reason.trim()
          ? raw.reason.trim()
          : fallback.reason,
    };
  } catch {
    return fallback;
  }
}

export async function generateFirstRunPlan(
  content: string,
): Promise<FirstRunPlanResult> {
  type RawFirstRunPlan = Partial<{
    projectName: string;
    objective: string;
    milestone: string;
    taskTitle: string;
    taskShortTitle: string;
    executionMode: string;
    doneWhen: string;
    maxTurns: number;
    toolPolicy: string;
  }>;
  const fallback: FirstRunPlanResult = {
    ...heuristicFirstRun(content),
    usedFallback: true,
  };
  const text = await callModel(
    `你是走走里的新人推进伙伴，不是计划工具。用户会输入一个真实想法。你的任务不是替他做一份大计划，而是判断此刻哪种推进方式最合适，再把想法收成一个具体的动作。
要求：
- projectName 用 2-8 个字概括核心方向，不能照抄原句。
- projectName 不要用“计划”作为名称后缀。
- 先判断用户更需要哪一种推进：拿真实反馈、做出可见产出、解决一个卡点、完成一次学习练习、做关键取舍、减少负担，或建立低摩擦节奏。不要一律套用“最小下一步”。
- projectObjective 必须是你理解后的目的总结，不得复制、截断或复述用户原话，也不要出现“把‘……’变成……”这类机械句式；一句话说明这件事为什么值得做、希望最终改变什么。
- projectMilestone 必须描述一个具体、可观察的阶段结果，不得套用“出现第一个进展、完成最小成果”等模板句，也不能照抄 projectObjective。
- taskTitle 要直接描述今天能做的一个具体动作，通常 10-45 分钟；不要以“先”字开头，不要出现“最小下一步、完成最小、第一个最小动作”这类口号。如果确实适合小范围验证，也可以保留轻盈的尺度，但要说清楚到底做什么。
- taskShortTitle 是列表展示用的语义标题，4-12 个字；要理解 taskTitle 的动作、对象和场景后重新概括，不能截取开头，也不能写成“推进任务”“执行第一步”。
- executionMode 只能是 quick、tool、produce、explore、project；小任务用 quick，需要外部最新信息用 tool，需要产出用 produce，需要验证用 explore，长期目标才用 project。
- doneWhen 必须写清楚什么结果算完成，不能写“继续优化”“保持耐心”；maxTurns 为 quick=1、tool/produce=2、explore/project=3。
- toolPolicy 只能是 none、read、confirm-write；只有需要外部信息时才用 read。
- 三条内容要彼此呼应，但不能像同一个模板换词。
- 只返回 JSON，不要 Markdown。
格式：{"projectName":"","projectObjective":"","projectMilestone":"","taskTitle":"","taskShortTitle":"","executionMode":"quick","doneWhen":"","maxTurns":1,"toolPolicy":"none"}`,
    JSON.stringify({ idea: content }),
    undefined,
    undefined,
    undefined,
    0.7,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as RawFirstRunPlan;
    const trimmed = content.trim();
    const projectName =
      typeof raw.projectName === "string" && raw.projectName.trim()
        ? raw.projectName.trim().slice(0, 60)
        : fallback.projectName;
    const objective =
      typeof raw.objective === "string" &&
      raw.objective.trim() &&
      raw.objective.trim() !== trimmed &&
      !/把[“”"].*变成|实际推进.*随时调整|初版|最小|第一步|先确认|先看到|核心方向|现实限制|最先值得|能看见|真正能执行/.test(
        raw.objective,
      )
        ? raw.objective.trim().slice(0, 500)
        : fallback.objective;
    const milestone =
      typeof raw.milestone === "string" &&
      raw.milestone.trim() &&
      !/初版|最小|第一步|具体成果|出现第一个|第一个进展|确认这件事/.test(
        raw.milestone,
      )
        ? raw.milestone.trim().slice(0, 200)
        : fallback.milestone;
    const taskTitle =
      typeof raw.taskTitle === "string" &&
      raw.taskTitle.trim() &&
      raw.taskTitle.trim() !== trimmed
        ? raw.taskTitle.trim().slice(0, 200)
        : fallback.taskTitle;
    const taskShortTitle = normalizeShortTitle(raw.taskShortTitle, taskTitle);
    const contract = buildTaskContract(trimmed, taskTitle);
    const executionMode =
      typeof raw.executionMode === "string" &&
      ["quick", "tool", "produce", "explore", "project"].includes(raw.executionMode)
        ? raw.executionMode
        : contract.executionMode;
    const doneWhen =
      typeof raw.doneWhen === "string" && raw.doneWhen.trim()
        ? raw.doneWhen.trim().slice(0, 200)
        : contract.doneWhen;
    const maxTurns =
      typeof raw.maxTurns === "number" && raw.maxTurns > 0
        ? Math.min(Math.floor(raw.maxTurns), 5)
        : contract.maxTurns;
    const toolPolicy =
      typeof raw.toolPolicy === "string" &&
      ["none", "read", "confirm-write"].includes(raw.toolPolicy)
        ? raw.toolPolicy
        : contract.toolPolicy;

    return {
      projectName:
        projectName === trimmed ? fallback.projectName : projectName,
      objective,
      milestone,
      taskTitle,
      taskShortTitle,
      taskExecutionMode: executionMode,
      taskDoneWhen: doneWhen,
      taskMaxTurns: maxTurns,
      taskToolPolicy: toolPolicy,
      usedFallback: false,
    };
  } catch {
    return fallback;
  }
}

export async function generateTaskEditSuggestion(input: {
  title: string;
  shortTitle?: string | null;
  notes?: string | null;
  priority?: string;
  scheduledDate?: string | null;
  dueDate?: string | null;
  focusDate?: string | null;
  idea: string;
}, memorySummary?: string, evidence?: string[]): Promise<TaskEditSuggestion> {
  const fallback: TaskEditSuggestion = {
    title: input.idea.trim() || input.title,
    shortTitle: normalizeShortTitle(input.shortTitle, input.title),
    notes: input.notes ?? null,
    priority: safePriority(input.priority),
    reason: "本地规则：把你的想法作为新的任务标题，保留原备注。",
  };

  const text = await callModel(
    `你是走走里的任务推进伙伴，不是标准修改助手。用户会输入一个修改想法，以及当前任务字段。你需要理解用户真正想调整什么：可能是负担太重、方向变了、没时间或状态不佳。只返回 JSON，不要 Markdown。格式：{"title":"新标题","shortTitle":"精简标题","notes":"备注","priority":"low|medium|high|urgent","scheduledDate":"YYYY-MM-DD或null","dueDate":"YYYY-MM-DD或null","focusDate":"YYYY-MM-DD或null","reason":"中文说明为什么这样改"}。shortTitle 要理解任务的动作、对象和场景后重新概括，4-12 个字，不能截取 title 开头；只返回需要改的字段，reason 必须返回，并且要引用用户原话中的真实理由。如果用户想缓一缓或缩小范围，优先降低负担、简化任务，不要强行排期。`,
    JSON.stringify({
      ...input,
      memorySummary: memorySummary ?? null,
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.55,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<TaskEditSuggestion>;
    return {
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 200)
          : fallback.title,
      shortTitle: normalizeShortTitle(
        raw.shortTitle,
        raw.title?.trim() || input.title,
      ),
      notes:
        typeof raw.notes === "string"
          ? raw.notes.trim()
          : fallback.notes,
      priority: safePriority(raw.priority),
      scheduledDate:
        typeof raw.scheduledDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.scheduledDate)
          ? raw.scheduledDate
          : fallback.scheduledDate,
      dueDate:
        typeof raw.dueDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)
          ? raw.dueDate
          : fallback.dueDate,
      focusDate:
        typeof raw.focusDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.focusDate)
          ? raw.focusDate
          : fallback.focusDate,
      reason:
        typeof raw.reason === "string" && raw.reason.trim()
          ? raw.reason.trim()
          : fallback.reason,
    };
  } catch {
    return fallback;
  }
}

export async function generateProjectEditSuggestion(input: {
  name: string;
  objective: string;
  currentMilestone?: string | null;
  status?: string;
  notes?: string | null;
  idea: string;
}, memorySummary?: string, evidence?: string[]): Promise<ProjectEditSuggestion> {
  const fallback: ProjectEditSuggestion = {
    objective: input.idea.trim() || input.objective,
    notes: input.notes ?? null,
    reason: "本地规则：把你的想法作为新的项目目标，保留原备注。",
  };

  const text = await callModel(
    `你是走走里的项目推进伙伴，不是标准修改助手。用户会输入一个修改想法，以及当前项目字段。你需要理解这个项目对用户来说为什么重要、当前卡在哪，并返回最合理的修改建议。只返回 JSON，不要 Markdown。格式：{"name":"项目名称","objective":"项目目标","currentMilestone":"当前里程碑","status":"active|paused|completed|archived","notes":"备注","reason":"中文说明为什么这样改"}。只返回需要改的字段，reason 必须返回，并且引用用户原话中的真实理由。如果用户提到暂停、缩小或换方向，优先让项目负担更轻，而不是增加新承诺。`,
    JSON.stringify({
      ...input,
      memorySummary: memorySummary ?? null,
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.55,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<ProjectEditSuggestion>;
    return {
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim().slice(0, 120)
          : undefined,
      objective:
        typeof raw.objective === "string" && raw.objective.trim()
          ? raw.objective.trim().slice(0, 500)
          : fallback.objective,
      currentMilestone:
        typeof raw.currentMilestone === "string"
          ? raw.currentMilestone.trim()
          : fallback.currentMilestone,
      status:
        typeof raw.status === "string" &&
        ["active", "paused", "completed", "archived"].includes(raw.status)
          ? raw.status
          : undefined,
      notes:
        typeof raw.notes === "string"
          ? raw.notes.trim()
          : fallback.notes,
      reason:
        typeof raw.reason === "string" && raw.reason.trim()
          ? raw.reason.trim()
          : fallback.reason,
    };
  } catch {
    return fallback;
  }
}

export async function generateTaskShortTitle(input: {
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
}): Promise<TaskShortTitleSuggestion> {
  const fallback = {
    shortTitle: normalizeShortTitle(null, input.title),
  };
  const text = await callModel(
    `你是走走里的任务信息提炼助手。请理解任务的完整标题、备注、所属项目和当前状态，识别这个任务真正要处理的动作、对象与场景，再生成一个列表展示用的语义标题。
要求：
- shortTitle 为 4-12 个字，像人给任务贴的简洁标签。
- 不能直接截取标题开头，不能只复述时间和分钟数。
- 必须保留任务最关键的对象或差异，例如“验证国内替代方案”“注册 Atypica 跑通流程”“整理首批用户反馈”。
- 不要使用“推进任务”“执行第一步”“完成计划”这类空泛表达。
- 只返回 JSON，不要 Markdown。格式：{"shortTitle":""}`,
    JSON.stringify(input),
    undefined,
    undefined,
    undefined,
    0.4,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<TaskShortTitleSuggestion>;
    return {
      shortTitle: normalizeShortTitle(raw.shortTitle, input.title),
    };
  } catch {
    return fallback;
  }
}

export async function generateTaskCoachAdvice(input: {
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  message: string;
}, memorySummary?: string, evidence?: string[]): Promise<TaskCoachAdvice> {
  const fallback = buildLocalTaskCoachAdvice(input);

  const text = await callModel(
    `你是走走里的任务伙伴，不是标准助手。用户会给你一个任务标题和一段很随意的想法。你要像熟悉他的朋友一样，先接住他的话，再写一张便利贴。
硬性要求：
- 必须回应用户原话和任务标题，不能只讲通用道理。
- 禁止使用“卡住很正常”“保持耐心”“一步一步来”“你可以尝试”这类模板句。
- 禁止每次使用同一套结构；根据用户原话里的具体词改变标题、鼓励语、步骤和下一步。
- 把用户原话中的细节直接带进内容，不要只替换任务名。
- 先判断用户更需要澄清、取舍、找反馈、降低阻力还是直接动手，不必每次都拆成“小步”。
- 步骤要具体到马上能做；nextStep 是接下来最合适的动作，通常 10-20 分钟，不要总以“先”字开头，也不要固定写“最小一步”。
- nextStep 不能是“思考一下”“整理思路”这类抽象指令。
- 不要用“你只需要”“你应该”这类说教句式。
- 语气像人写的，不像 AI 生成的。
- 只返回 JSON，不要 Markdown。
格式：{"title":"便利贴标题","encouragement":"一句鼓励","steps":["2-3个具体指导步骤"],"nextStep":"接下来可做的具体动作"}
示例输入：任务“整理作品集”，想法“我不知道该放什么”
示例输出：{"title":"从三张最能代表你的作品开始","encouragement":"你不知道放什么，是因为还没想清楚要给谁看。","steps":["写下你希望作品集让谁看到","挑三张你最想被记住的作品","把这三张放上去，其他以后再说"],"nextStep":"挑三张作品并放上去"}`,
    JSON.stringify({
      ...input,
      memorySummary: memorySummary ?? null,
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.75,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<TaskCoachAdvice>;
    const steps = Array.isArray(raw.steps)
      ? raw.steps
          .filter(
            (step): step is string =>
              typeof step === "string" && step.trim().length > 0,
          )
          .slice(0, 4)
      : [];

    return {
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 80)
          : fallback.title,
      encouragement:
        typeof raw.encouragement === "string" && raw.encouragement.trim()
          ? raw.encouragement.trim().slice(0, 200)
          : fallback.encouragement,
      steps: steps.length ? steps : fallback.steps,
      nextStep:
        typeof raw.nextStep === "string" && raw.nextStep.trim()
          ? raw.nextStep.trim().slice(0, 200)
          : fallback.nextStep,
    };
  } catch {
    return fallback;
  }
}

function buildLocalTaskCoachAdvice(input: {
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  message: string;
}): TaskCoachAdvice {
  const message = input.message.trim();
  const title = input.title;
  const short =
    message.length > 36 ? `${message.slice(0, 36)}…` : message;
  const lower = message.toLowerCase();
  const seed = [...`${title}:${message}`].reduce(
    (hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0,
    0,
  );

  if (/没头绪|不知道|怎么开始|不会开始|完全不懂|没想法/.test(lower)) {
    return [
      {
        title: `${title} 的启动版`,
        encouragement: `你说“${short}”，那就先从这句话里找一个能做的动词。`,
        steps: [
          `把“${title}”的第一步写成“打开、写下、列出或试做”这类动作。`,
          `从“${short}”里挑一个你最关心的词，作为这次目标。`,
          `只做 10 分钟，做完就停。`,
        ],
        nextStep: `用一句话写出“${title}”的 10 分钟第一步。`,
      },
      {
        title: `${title} 的最小开始`,
        encouragement: `“${short}”还没有变成动作，所以你觉得不知道怎么开始。`,
        steps: [
          `把“${title}”变成一个今天能完成的最小结果。`,
          `把“${short}”转成一句能问自己的话。`,
          `先回答那句话，再决定下一步。`,
        ],
        nextStep: `回答“${short}”里最让你没底的那句话。`,
      },
      {
        title: `${title} 的第一次推进`,
        encouragement: `“${title}”对你不是没价值，是第一步还没被定义清楚。`,
        steps: [
          `先给“${title}”设一个 10 分钟标准。`,
          `从“${short}”里找出最容易先做到的部分。`,
          `今天只完成那一个部分。`,
        ],
        nextStep: `完成“${title}”里最容易先做到的部分。`,
      },
    ][seed % 3];
  }

  if (/卡住|困难|问题|不会|不懂|卡在|做不下去/.test(lower)) {
    return [
      {
        title: `${title} 的卡点`,
        encouragement: `你说“${short}”，那我们就只处理这一句里最卡的部分。`,
        steps: [
          `把“${title}”里最卡的部分单独摘出来。`,
          `写下你试过什么、卡在什么现象上。`,
          `先只解决这个卡点。`,
        ],
        nextStep: `写下“${title}”里最卡的一句话。`,
      },
      {
        title: `${title} 的诊断`,
        encouragement: `卡住通常不是不会，而是没有把问题说清楚。`,
        steps: [
          `把“${short}”改写成一句“我卡在……，因为……”。`,
          `看看这句话里，哪个词是真正难点。`,
          `只针对那个难点找一个小动作。`,
        ],
        nextStep: `把“${short}”改写成“我卡在…，因为…”。`,
      },
      {
        title: `${title} 的下一步`,
        encouragement: `你已经走到具体问题这一步，剩下的不是重新开始，而是拆小。`,
        steps: [
          `找出“${title}”里你现在能控制的最小部分。`,
          `先做能控制的，暂时放下不能控制的。`,
          `把下一步写成一句明确的动作。`,
        ],
        nextStep: `写出“${title}”里现在能控制的具体动作。`,
      },
    ][seed % 3];
  }

  if (/没时间|时间不够|来不及|太忙/.test(lower)) {
    return [
      {
        title: `${title} 的碎片版`,
        encouragement: `你说“${short}”，那就把它切成 10 分钟能吃下去的样子。`,
        steps: [
          `把“${title}”拆成 10 分钟和 30 分钟两个版本。`,
          `今天只做 10 分钟版本。`,
          `做完后把剩余部分标记为明天继续。`,
        ],
        nextStep: `完成“${title}”的 10 分钟版。`,
      },
      {
        title: `${title} 的低负担版`,
        encouragement: `没时间通常不是真的没有，而是这个任务在你心里被放大了。`,
        steps: [
          `把“${title}”缩小成“只做一步”的标准。`,
          `先做最不需要准备材料的那一步。`,
          `做完后允许自己停。`,
        ],
        nextStep: `完成“${title}”里最不需要准备的一步。`,
      },
      {
        title: `${title} 的 10 分钟入口`,
        encouragement: `不用等有空，先给“${title}”留 10 分钟。`,
        steps: [
          `把“${title}”里最容易启动的动作挑出来。`,
          `设一个 10 分钟倒计时。`,
          `时间到就停，不要求做完。`,
        ],
        nextStep: `今天做 10 分钟“${title}”。`,
      },
    ][seed % 3];
  }

  if (/太多|乱|优先级|选择|不知道先做|哪个/.test(lower)) {
    return [
      {
        title: `${title} 的取舍`,
        encouragement: `“${short}”听起来不是一件事，而是好几件事叠在一起。`,
        steps: [
          `把“${title}”拆成“现在必须做、可以缓、可以不做”三堆。`,
          `从“必须做”里挑一件。`,
          `其他暂时不看。`,
        ],
        nextStep: `从“${title}”里挑一件现在必须做的。`,
      },
      {
        title: `${title} 的排序`,
        encouragement: `选择太多的时候，第一步不是做，而是删。`,
        steps: [
          `把“${title}”相关的所有念头列出来。`,
          `删掉现在不重要的。`,
          `剩下的只选一件推进。`,
        ],
        nextStep: `把“${title}”相关的念头删到只剩一件。`,
      },
      {
        title: `${title} 的唯一重点`,
        encouragement: `“${short}”让你乱，是因为没有唯一重点。`,
        steps: [
          `写下“${title}”如果只做一件事，会是什么。`,
          `把其他事标记为稍后。`,
          `先做那一件事。`,
        ],
        nextStep: `写下“${title}”唯一要做的一件事。`,
      },
    ][seed % 3];
  }

  return [
    {
      title: `${title} 的具体化`,
      encouragement: `你说“${short}”，下一步不是马上做，而是把它说具体。`,
      steps: [
        `把“${title}”写成具体结果。`,
        `从“${short}”里挑一个能验证的词。`,
        `先完成能验证的最小一步。`,
      ],
      nextStep: `写出“${title}”的具体结果。`,
    },
    {
      title: `${title} 的下一步`,
      encouragement: `关于“${title}”，你已经有关键想法了，现在只需要把它变成动作。`,
      steps: [
        `把“${title}”拆成一个今天能做的动作。`,
        `把“${short}”里最想解决的部分放进去。`,
        `从不需要别人帮忙的那一项开始。`,
      ],
      nextStep: `写出“${title}”今天能做的第一个动作。`,
    },
    {
      title: `${title} 的推进点`,
      encouragement: `“${short}”就是这次推进的入口，不用再重新想方向。`,
      steps: [
        `围绕“${short}”选一个小动作。`,
        `先做 10 分钟。`,
        `把结果或卡点写下来。`,
      ],
      nextStep: `围绕“${short}”做 10 分钟。`,
    },
  ][seed % 3];
}

function heuristicToday(tasks: FocusTask[]): TodaySuggestion[] {
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...tasks]
    .sort((a, b) => {
      const priorityDiff =
        (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      return (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0);
    })
    .slice(0, 3)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      projectName: task.projectName,
      priority: safePriority(task.priority),
      reason: task.dueDate
        ? "先处理临近截止的这件，避免拖延变成负担"
        : "今天先推进这一件，不用给自己太多压力",
      evidence: [],
    }));
}

export async function suggestTodayFocus(
  tasks: FocusTask[],
  context?: {
    reviewSummary?: string;
    projects?: InboxProjectContext[];
  },
  memorySummary?: string,
  evidence?: string[],
) {
  const fallback = heuristicToday(tasks);
  if (!tasks.length) return fallback;

  const text = await callModel(
    "你是走走里的今日推进伙伴，不是标准排期助手。根据任务列表、最近复盘和用户反馈，选择今天最值得推进的 1-3 个任务。不要只按优先级和截止日期选；reason 要像朋友解释为什么今天做它，可以引用复盘、项目状态或用户原话，不要总用“先做最小一步”这类说法。如果用户最近有延期或低质量反馈，优先选负担合适、真的能开始的任务。只返回 JSON，不要 Markdown。格式：{\"suggestions\":[{\"title\":\"任务标题\",\"reason\":\"中文理由\"}]}。",
    JSON.stringify({
      tasks: tasks.map((task) => ({
        title: task.title,
        project: task.projectName,
        priority: task.priority,
        dueDate: task.dueDate?.toISOString().slice(0, 10),
      })),
      reviewSummary: context?.reviewSummary ?? null,
      projects: context?.projects ?? [],
      memorySummary: memorySummary ?? null,
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.65,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as {
      suggestions?: Array<{ title?: string; reason?: string }>;
    };
    const suggestions = (raw.suggestions ?? [])
      .map((item) => {
        const task = tasks.find((candidate) => candidate.title === item.title);
        if (!task) return null;
    return {
      taskId: task.id,
      title: task.title,
      projectName: task.projectName,
      priority: safePriority(task.priority),
      reason: typeof item.reason === "string" ? item.reason : "AI 建议",
      evidence: evidence ?? [],
    };
      })
      .filter((item): item is TodaySuggestion => item !== null)
      .slice(0, 3);

    return suggestions.length ? suggestions : fallback;
  } catch {
    return fallback;
  }
}

function heuristicReview(
  completed: Array<{ title: string; projectName: string | null }>,
  open: Array<{ title: string; projectName: string | null }>,
  planned: Array<{ title: string }>,
  projects: Array<{
    name: string;
    currentMilestone: string | null;
    taskCount: number;
  }>,
) {
  const projectSummary = projects.length
    ? `目前主要在推进${projects
        .slice(0, 3)
        .map(
          (project) =>
            `${project.name}${
              project.currentMilestone
                ? `（${project.currentMilestone}）`
                : ""
            }`,
        )
        .join("、")}。`
    : "";
  const completedText = completed.length
    ? completed
        .slice(0, 3)
        .map((task) => task.title)
        .join("、")
    : "暂无完成";
  const openText = open.length
    ? `还没完成的有 ${open
        .slice(0, 3)
        .map((task) => task.title)
        .join("、")}。`
    : "";

  return {
    summary: completed.length
      ? `今天完成了 ${completedText}。${openText}${projectSummary}`.trim()
      : `今天没有完成明确任务。${openText}${projectSummary}`.trim(),
    nextActions: open
      .slice(0, 3)
      .map(
        (task) =>
          `${normalizeShortTitle(null, task.title)}\n${task.title}`,
      )
      .join("\n"),
  };
}

export async function generateReviewDraft(input: {
  completed: Array<{ title: string; projectName: string | null }>;
  open: Array<{ title: string; projectName: string | null }>;
  planned: Array<{ title: string }>;
  projects: Array<{
    name: string;
    currentMilestone: string | null;
    taskCount: number;
  }>;
}, evidence?: string[], onDelta?: (delta: string) => void) {
  const fallback = heuristicReview(
    input.completed,
    input.open,
    input.planned,
    input.projects,
  );

  const text = await callModel(
    "你是走走里的每日复盘伙伴。请根据当天完成的任务、今日计划、未完成任务和项目状态，写一段像用户自己留在纸上的复盘，不要写成汇报、心理分析或总结陈词。summary 2-4 句话，先说具体做了什么，再说卡在哪里、下一步怎么判断；不要使用“今天真正推进的是”“不是……而是……”“意味着”“价值在于”等模板句，不要罗列任务数量。nextActions 只写 1-3 条，每条任务分两行：第一行是 6-16 个字的精简标题，第二行是 20-45 个字的具体说明。不要标序号、不要项目符号、不要竖线、不要写日期。只返回 JSON，不要 Markdown。格式：{\"summary\":\"总结\",\"nextActions\":\"精简标题\\n具体说明\\n精简标题\\n具体说明\"}。",
    JSON.stringify({ ...input, contextEvidence: evidence ?? [] }),
    undefined,
    undefined,
    undefined,
    0.65,
    { onDelta, maxTokens: 1200 },
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<ReviewDraft>;
    if (
      typeof raw.summary === "string" &&
      typeof raw.nextActions === "string"
    ) {
      return {
        summary: raw.summary.trim(),
        nextActions: raw.nextActions.trim(),
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}
