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
        tasks: [],
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
        (node) => node.textContent.trim() === "当前阶段",
      );
      return label && label.parentElement
        ? label.parentElement.className.includes("accent")
        : null;
    })()`,
  );
  const longtermChecks = [
    ["强调色标在「当前阶段」", accentOnCurrent === true],
    ["当前阶段显示总结版", longtermText.includes("把工具做到陌生人也能用")],
    ["下一阶段在当前阶段就显示", longtermText.includes("补齐错误提示和使用说明")],
    ["不再显示「当前阶段完成后生成」", !longtermText.includes("当前阶段完成后生成")],
  ];
  for (const [label, ok] of longtermChecks) {
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
