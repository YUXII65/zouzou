/**
 * 新手引导「便利贴」这一步的关闭行为验证。
 *
 * 用户报告：点引导气泡的叉，下面那层被收掉，一点开引导又出现。
 * 根因：引导气泡用 createPortal 挂在 body 上，页面里的"点外面就收起"
 * 监听的是 document mousedown，会把点叉当成"点在外面"→ 先收起面板 →
 * 布局跳动 → 关闭按钮的 onClick 可能不执行 → 引导步骤卡在原地。
 *
 * 断言（稳定的那个信号）：点叉时下面那层必须保持展开。
 *
 * 用法（需本地服务在跑）：
 *   pnpm dev
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     --import ./scripts/ts-alias-loader.mjs scripts/verify-tour-dismiss.mjs
 */
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, issueSessionToken } from "@/lib/session";
import { FIRST_RUN_TOUR_ENABLED } from "@/lib/tour";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const debugPort = 9341;
const profile = path.join(os.tmpdir(), `zouzou-tour-repro-${Date.now()}`);

const user = await prisma.user.create({
  data: { username: `tour_${Date.now()}`, passwordHash: "x" },
  select: { id: true },
});
const project = await prisma.project.create({
  data: { userId: user.id, name: "引导复现项目", objective: "复现便利贴引导", status: "active", mode: "normal" },
  select: { id: true },
});
await prisma.task.create({
  data: {
    userId: user.id, projectId: project.id, title: "随便一件任务", shortTitle: "随便一件任务",
    status: "todo", executionMode: "quick", doneWhen: "做掉", maxTurns: 1, toolPolicy: "none",
  },
});
// 新手引导走到第 3 步（便利贴）
await prisma.userPreference.upsert({
  where: { userId_key_source: { userId: user.id, key: "first_run_tour", source: "system" } },
  update: { value: "3" },
  create: { userId: user.id, key: "first_run_tour", source: "system", value: "3" },
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

const chrome = spawn(chromePath, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  "--disable-gpu", "--no-sandbox", "--window-size=1280,900", "about:blank",
], { stdio: "ignore", windowsHide: true });

let cdp;
try {
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
  await delay(3500);

  const hintShown = await waitFor(
    `!!document.querySelector('[data-floating-layer][role="note"]')`,
    FIRST_RUN_TOUR_ENABLED ? 30000 : 5000,
  );
  console.log("引导气泡出现:", hintShown);

  if (!FIRST_RUN_TOUR_ENABLED) {
    // 引导已下线：必须确认它真的不出现
    const okDisabled = !hintShown;
    console.log(okDisabled ? "PASS tour-disabled" : "FAIL tour-disabled（引导已关闭却仍出现）");
    process.exitCode = okDisabled ? 0 : 1;
    cdp.close();
    chrome.kill();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(process.exitCode);
  }
  const hintTitle = await evaluate(`document.querySelector('[data-floating-layer][role="note"] p')?.textContent ?? ""`);
  console.log("气泡标题:", hintTitle);

  // 展开任务（让 useClickOutside 的面板处于打开状态）
  const clickVisible = `(() => { const nodes = Array.from(document.querySelectorAll('[data-tour="task-sticky"]')); const el = nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (!el) return "none"; el.click(); return el.getAttribute('aria-expanded'); })()`;
  console.log("点击前 aria-expanded:", await evaluate(`(() => { const nodes = Array.from(document.querySelectorAll('[data-tour="task-sticky"]')); const el = nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); return el?.getAttribute('aria-expanded') ?? "none"; })()`));
  console.log("点击返回:", await evaluate(clickVisible));
  await delay(800);
  const expandedBefore = await evaluate(`(() => { const nodes = Array.from(document.querySelectorAll('[data-tour="task-sticky"]')); const el = nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); return el?.getAttribute('aria-expanded') === 'true'; })()`);
  console.log("面板已展开:", expandedBefore);

  // 用真实鼠标事件点气泡的 X
  const rect = await evaluate(`(() => { const el = document.querySelector('[aria-label="关闭引导"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  if (!rect) throw new Error("找不到关闭按钮");
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await delay(120);
  console.log("mousedown 后面板还开着:", await evaluate(`(() => { const nodes = Array.from(document.querySelectorAll('[data-tour="task-sticky"]')); const el = nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); return el?.getAttribute('aria-expanded') === 'true'; })()`));
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await delay(120);
  console.log("mouseup 后面板还开着:", await evaluate(`(() => { const nodes = Array.from(document.querySelectorAll('[data-tour="task-sticky"]')); const el = nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); return el?.getAttribute('aria-expanded') === 'true'; })()`));
  await delay(1200);

  const hintGone = await evaluate(`!document.querySelector('[data-floating-layer][role="note"]')`);
  const stillExpanded = await evaluate(`(() => { const nodes = Array.from(document.querySelectorAll('[data-tour="task-sticky"]')); const el = nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); return el?.getAttribute('aria-expanded') === 'true'; })()`);
  const persisted = await prisma.userPreference.findUnique({
    where: { userId_key_source: { userId: user.id, key: "first_run_tour", source: "system" } },
    select: { value: true },
  });

  console.log("点 X 后气泡消失:", hintGone);
  console.log("点 X 后面板仍展开（不该被点外面收掉）:", stillExpanded);
  console.log("服务端引导步骤:", persisted?.value);

  // 主断言用稳定信号：点关闭按钮时，下面那层不能被"点外面"收掉——
  // 收了就会引起布局跳动，关闭按钮自己的 onClick 可能不执行，引导步骤卡在原地。
  const ok = hintGone && stillExpanded && persisted?.value === "done";
  console.log(ok ? "PASS tour-dismiss" : "FAIL tour-dismiss");
  process.exitCode = ok ? 0 : 1;
} finally {
  cdp?.close();
  chrome.kill();
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
}
