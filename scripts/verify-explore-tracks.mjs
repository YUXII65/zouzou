/**
 * 文件页阶段展示端到端验证。
 *
 * 断言两件事：
 * 1) explore 项目展开后能看到主线 / 支线和线路名，且不再显示「当前练到哪」；
 * 2) longterm 项目在当前阶段就能看到「当前阶段 / 下一阶段」的总结版，
 *    而不是「当前阶段完成后生成」。
 *
 * 这两条分别是「探索是多线路、有主次」和「阶段展示要总结版」的回归门禁。
 *
 * 用法（需本地服务在跑）：
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     --import ./scripts/ts-alias-loader.mjs scripts/verify-explore-tracks.mjs
 */
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, issueSessionToken } from "@/lib/session";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const debugPort = 9351;
const profile = path.join(os.tmpdir(), `zouzou-explore-tracks-${Date.now()}`);

const stamp = Date.now();
const user = await prisma.user.create({
  data: { username: `tracks_${stamp}`, passwordHash: "x" },
  select: { id: true },
});

let cdp;
let chrome;
let failed = false;
try {
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: "吉他探索",
      objective: "同时发展手型和乐理，看哪条线更走得通",
      status: "active",
      mode: "explore",
      currentMilestone: "先把 C 和弦按实",
    },
    select: { id: true },
  });
  const mainTrack = await prisma.projectTrack.create({
    data: {
      userId: user.id,
      projectId: project.id,
      order: 0,
      name: "和弦手型",
      intent: "把常用和弦按实、换得动",
      role: "main",
      status: "active",
      currentFocus: "C 和弦按实",
    },
    select: { id: true },
  });
  const sideTrack = await prisma.projectTrack.create({
    data: {
      userId: user.id,
      projectId: project.id,
      order: 1,
      name: "基础乐理",
      intent: "看懂谱面和节奏型",
      role: "side",
      status: "active",
      currentFocus: "认四分音符",
    },
    select: { id: true },
  });
  await prisma.task.create({
    data: {
      userId: user.id,
      projectId: project.id,
      trackId: mainTrack.id,
      title: "把 C 和弦按实并录一段",
      shortTitle: "按实 C 和弦",
      status: "todo",
      priority: "medium",
      executionMode: "explore",
      doneWhen: "能连续换 8 次不闷音",
      maxTurns: 3,
      toolPolicy: "none",
    },
  });
  await prisma.task.create({
    data: {
      userId: user.id,
      projectId: project.id,
      trackId: sideTrack.id,
      title: "认一遍四分音符和八分音符",
      shortTitle: "认音符时值",
      status: "todo",
      priority: "low",
      executionMode: "explore",
      doneWhen: "能跟着节拍器拍出来",
      maxTurns: 3,
      toolPolicy: "none",
    },
  });

  const token = issueSessionToken(user.id);

  class CDP {
    constructor(url) { this.socket = new WebSocket(url); this.nextId = 1; this.pending = new Map(); }
    async connect() {
      await new Promise((res, rej) => { this.socket.addEventListener("open", res, { once: true }); this.socket.addEventListener("error", rej, { once: true }); });
      this.socket.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (!m.id) return;
        const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      });
    }
    send(method, params = {}) {
      const id = this.nextId++;
      const promise = new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej }));
      this.socket.send(JSON.stringify({ id, method, params }));
      return promise;
    }
    close() { this.socket.close(); }
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitForHttp(url, timeoutMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { try { const r = await fetch(url); if (r.ok) return r; } catch {} await delay(150); }
    throw new Error("chrome debug port timeout");
  }

  chrome = spawn(chromePath, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--disable-gpu", "--no-sandbox", "--window-size=1280,900", "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const page = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", { name: SESSION_COOKIE, value: token, url: `${baseUrl}/`, httpOnly: true, sameSite: "Lax" });

  const evaluate = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "eval failed");
    return r.result?.value;
  };
  const waitFor = async (expr, timeoutMs = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { if (await evaluate(expr)) return true; await delay(200); }
    return false;
  };

  await cdp.send("Page.navigate", { url: `${baseUrl}/files?project=${project.id}` });
  const rendered = await waitFor("document.body && document.body.innerText.includes('和弦手型')");
  const bodyText = rendered ? await evaluate("document.body.innerText") : "";

  const checks = [
    ["页面渲染出线路名", bodyText.includes("和弦手型")],
    ["显示主线标记", bodyText.includes("主线")],
    ["显示支线标记", bodyText.includes("支线")],
    ["显示第二条线路", bodyText.includes("基础乐理")],
    ["删掉「当前练到哪」胶囊", !bodyText.includes("当前练到哪")],
    ["线路图不显示主线小字", !bodyText.includes("把常用和弦按实、换得动")],
    ["线路图不显示支线小字", !bodyText.includes("看懂谱面和节奏型")],
  ];
  for (const [label, ok] of checks) {
    console.log((ok ? "✔ " : "✘ ") + label);
    if (!ok) failed = true;
  }
  // 第二条：longterm 项目的阶段展示必须是总结版，且当前阶段就能看到下一阶段
  const longtermProject = await prisma.project.create({
    data: {
      userId: user.id,
      name: "公网上线",
      objective: "把本地工具做成陌生人也能用的公网产品",
      status: "active",
      mode: "longterm",
      currentMilestone: "把公网网址从「朋友能用」推进到「陌生人打开也知道干什么、出错不会卡死」",
    },
    select: { id: true },
  });
  const longtermStage = await prisma.projectStage.create({
    data: {
      userId: user.id,
      projectId: longtermProject.id,
      order: 1,
      title: "当前阶段",
      deliverable: "把公网网址从「朋友能用」推进到「陌生人打开也知道干什么、出错不会卡死」",
      status: "active",
    },
    select: { id: true },
  });
  await prisma.projectStage.update({
    where: { id: longtermStage.id },
    data: {
      nextStageJson: JSON.stringify({
        currentSummary: "把工具做到陌生人也能用",
        nextSummary: "补齐错误提示和使用说明",
        nextMilestone: "陌生人首次打开无需解释就能完成一次完整操作",
        reason: "当前阶段已经能稳定打开，接下来补可用性。",
        tasks: [
          {
            title: "补一版错误提示文案",
            shortTitle: "补错误提示",
            doneWhen: "陌生人遇到错误时能看到明确提示",
          },
        ],
        source: "model",
      }),
    },
  });
  await prisma.task.create({
    data: {
      userId: user.id,
      projectId: longtermProject.id,
      stageId: longtermStage.id,
      title: "写一版工具用途说明",
      shortTitle: "写用途说明",
      status: "todo",
      priority: "medium",
      executionMode: "produce",
    },
  });

  await cdp.send("Page.navigate", { url: `${baseUrl}/files?project=${longtermProject.id}` });
  const longtermRendered = await waitFor("document.body && document.body.innerText.includes('把工具做到陌生人也能用')");
  const longtermText = longtermRendered ? await evaluate("document.body.innerText") : "";
  // 强调色必须在「当前阶段」（正在推进），而不是「下一阶段」（预告）
  const accentOnCurrent = await evaluate(
    `(() => {
      const label = Array.from(document.querySelectorAll("span")).find(
        (node) => new RegExp("^第 [0-9]+/[0-9]+ 阶段$").test(node.textContent.trim()),
      );
      return label && label.parentElement
        ? label.parentElement.className.includes("accent")
        : null;
    })()`,
  );
  const longtermChecks = [
    ["强调色标在「第 X/5 阶段」", accentOnCurrent === true],
    ["显示阶段序号和总数", longtermText.includes("第 1/5 阶段")],
    ["当前阶段显示总结版", longtermText.includes("把工具做到陌生人也能用")],
    ["下一阶段在当前阶段就显示短总结", longtermText.includes("补齐错误提示和使用说明")],
    ["下一阶段在当前阶段只显示短总结", !longtermText.includes("补错误提示")],
    ["不再显示长交付物原文", !longtermText.includes("陌生人首次打开无需解释就能完成一次完整操作")],
    ["不再显示 AI 小字 reason", !longtermText.includes("当前阶段已经能稳定打开")],
    ["不再显示「当前阶段完成后生成」", !longtermText.includes("当前阶段完成后生成")],
  ];
  for (const [label, ok] of longtermChecks) {
    console.log((ok ? "✔ " : "✘ ") + label);
    if (!ok) failed = true;
  }

  // 第三条：同一 ready 阶段连续确认两次，只能生成一个下一阶段。
  const raceProject = await prisma.project.create({
    data: {
      userId: user.id,
      name: "阶段确认竞态",
      objective: "验证阶段确认不会重复",
      status: "active",
      mode: "longterm",
      currentMilestone: "当前阶段已完成",
    },
    select: { id: true },
  });
  await prisma.projectStage.create({
    data: {
      userId: user.id,
      projectId: raceProject.id,
      order: 1,
      title: "当前阶段",
      deliverable: "当前阶段已完成，准备进入下一阶段",
      status: "ready",
      nextStageJson: JSON.stringify({
        currentSummary: "当前阶段已完成",
        nextSummary: "完成下一次真实陪诊",
        nextMilestone: "陪诊完成并回报结果",
        reason: "测试阶段确认幂等",
        tasks: [
          {
            title: "按排班完成一次真实陪诊",
            shortTitle: "完成真实陪诊",
            notes: null,
            executionMode: "produce",
            doneWhen: "群里收到当次陪诊结果",
            methodHint: "按约定时间到场，结束后把医生意见和下次时间发到群里",
            recommendation: "按排班陪诊，不重新讨论安排",
            executionSteps: ["按约定时间到场", "把医生意见发到群里"],
            fallback: "临时冲突就改约并通知当月替补",
            maxTurns: 2,
            toolPolicy: "none",
            priority: "medium",
            scheduledDate: "2026-10-16",
            dueDate: null,
          },
          {
            title: "核对当月照护费四人是否全部到账",
            shortTitle: "核对当月到账",
            notes: null,
            executionMode: "produce",
            doneWhen: "群里明确当月四人费用全部到账",
            methodHint: "照约定到账日核对，未到的单独确认补交时间",
            recommendation: "按约定收款日和金额核对，不改收款方式",
            executionSteps: ["按约定日期核对到账", "把结果发到群里"],
            fallback: "未到账的先确认补交日期",
            maxTurns: 2,
            toolPolicy: "none",
            priority: "medium",
            scheduledDate: "2026-10-16",
            dueDate: null,
          },
        ],
        source: "model",
      }),
    },
  });

  await cdp.send("Page.navigate", { url: `${baseUrl}/files?project=${raceProject.id}` });
  const raceReady = await waitFor(
    "document.body && document.body.innerText.includes('进入下一阶段')",
  );
  // ready 分支：只留一句话总结 +「进入下一阶段」，不再铺任务清单，也没有「重新生成」。
  // （这两条来自浏览器批注：任务清单要删、不要出现「重新生成」。）
  const raceText = raceReady ? await evaluate("document.body.innerText") : "";
  // CDP 必须在 hydration 之后点击：否则按钮上没有 React 事件处理器（__reactProps），
  // 原生 click() 什么都不会发生，Server Action 根本不会被调用。
  const raceHydrated = await waitFor(
    "(() => { const b = Array.from(document.querySelectorAll('button')).find((n) => n.textContent.includes('进入下一阶段')); return Boolean(b) && Object.keys(b).some((k) => k.startsWith('__reactProps')); })()",
  );

  const clickAt = Date.now();
  if (raceReady && raceHydrated) {
    await evaluate(
      "(() => { const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent.includes('进入下一阶段')); if (!button) return false; button.click(); button.click(); return true; })()",
    );
  }
  // 「进入下一阶段」必须立刻落地：阶段创建在事务里完成，下一阶段预览丢到 after() 后台，
  // 不能把用户卡在一次模型调用上（那会到 5-7 秒）。
  let raceStageCount = 0;
  let advanceMs = -1;
  for (let i = 0; i < 40; i += 1) {
    raceStageCount = await prisma.projectStage.count({
      where: { projectId: raceProject.id },
    });
    if (raceStageCount === 2) {
      advanceMs = Date.now() - clickAt;
      break;
    }
    await delay(250);
  }
  await delay(1500);
  const raceTaskCount = await prisma.task.count({
    where: { projectId: raceProject.id },
  });
  const raceChecks = [
    ["阶段确认页可渲染", raceReady],
    ["确认按钮在 hydration 后可交互", raceHydrated],
    [
      `进入下一阶段不被模型调用阻塞（实测 ${advanceMs}ms < 5000ms）`,
      advanceMs >= 0 && advanceMs < 5000,
    ],
    [
      "待确认阶段不再铺下一阶段任务清单",
      !raceText.includes("完成真实陪诊") && !raceText.includes("核对当月到账"),
    ],
    ["待确认阶段不出现「重新生成」", !raceText.includes("重新生成")],
    [`双击确认只生成一个下一阶段（实际 ${raceStageCount}）`, raceStageCount === 2],
    [`只生成两份下一阶段任务（实际 ${raceTaskCount}）`, raceTaskCount === 2],
  ];
  for (const [label, ok] of raceChecks) {
    console.log((ok ? "✔ " : "✘ ") + label);
    if (!ok) failed = true;
  }


  // 第三条：文件页和个人页都不要顶部 slogan + 标题
  await cdp.send("Page.navigate", { url: `${baseUrl}/files` });
  await waitFor("document.body && document.body.innerText.includes('文件') === false ? true : document.body.innerText.length > 200");
  const filesText = await evaluate("document.body.innerText");
  await cdp.send("Page.navigate", { url: `${baseUrl}/profile` });
  await waitFor("document.body && document.body.innerText.includes('个人')");
  const profileText = await evaluate("document.body.innerText");
  const headerChecks = [
    ["文件页顶部标题区已删除", !filesText.includes("让想法，走成下一步")],
    ["个人页顶部标题区已删除", !profileText.includes("让想法，走成下一步")],
  ];
  for (const [label, ok] of headerChecks) {
    console.log((ok ? "✔ " : "✘ ") + label);
    if (!ok) failed = true;
  }

  // 第四条：任务都做完了就别再说「没有推进中的任务」；首页也不再弹「这一阶段完成了」提醒卡。
  const doneProject = await prisma.project.create({
    data: {
      userId: user.id,
      name: "都已经收尾的项目",
      objective: "验证空状态文案",
      status: "active",
      mode: "normal",
    },
    select: { id: true },
  });
  await prisma.task.create({
    data: {
      userId: user.id,
      projectId: doneProject.id,
      title: "已经做完的那件事",
      shortTitle: "已经做完",
      status: "done",
      priority: "medium",
      executionMode: "quick",
      doneWhen: "做完",
      maxTurns: 1,
      toolPolicy: "none",
      completedAt: new Date(),
    },
  });
  await cdp.send("Page.navigate", { url: `${baseUrl}/files?project=${doneProject.id}` });
  const doneRendered = await waitFor(
    "document.body && document.body.innerText.includes('已全部完成')",
  );
  const doneText = doneRendered ? await evaluate("document.body.innerText") : "";
  await cdp.send("Page.navigate", { url: `${baseUrl}/` });
  await waitFor("document.body && document.body.innerText.length > 200");
  const homeText = await evaluate("document.body.innerText");
  const emptyStateChecks = [
    ["任务全部完成时显示「已全部完成」", doneRendered],
    ["不再显示「没有推进中的任务」", !doneText.includes("没有推进中的任务")],
    ["首页不再出现「这一阶段完成了」提醒卡", !homeText.includes("这一阶段完成了")],
  ];
  for (const [label, ok] of emptyStateChecks) {
    console.log((ok ? "✔ " : "✘ ") + label);
    if (!ok) failed = true;
  }

  if (failed) {
    console.log("--- body text (first 1200) ---");
    console.log(String(bodyText).slice(0, 1200));
    console.log("--- longterm text (first 1200) ---");
    console.log(String(longtermText).slice(0, 1200));
  }
} catch (error) {
  failed = true;
  console.error("verify failed:", error);
} finally {
  try { cdp?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { await prisma.user.delete({ where: { id: user.id } }); } catch {}
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}
