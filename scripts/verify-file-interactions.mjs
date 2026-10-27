/**
 * 文件页展开态交互验证。
 *
 * 断言第一次点击不会被“点外面收起”吞掉：
 * 1. 便利贴打开时，点另一个任务能直接切换过去；
 * 2. 便利贴打开时，任务状态能直接推进；
 * 3. 便利贴打开时，点另一个文件夹能直接展开另一个。
 *
 * 用法（需本地服务在跑）：
 *   pnpm dev
 *   pnpm verify:file-interactions
 */
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, issueSessionToken } from "@/lib/session";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
const parsedBaseUrl = new URL(baseUrl);
if (!["127.0.0.1", "localhost"].includes(parsedBaseUrl.hostname)) {
  throw new Error("verify-file-interactions 只允许连接本地服务");
}

const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const debugPort = 9342;
const profile = path.join(os.tmpdir(), `zouzou-file-interactions-${Date.now()}`);

const user = await prisma.user.create({
  data: { username: `file_interactions_${Date.now()}`, passwordHash: "x" },
  select: { id: true },
});

const [firstProject, secondProject] = await Promise.all([
  prisma.project.create({
    data: {
      userId: user.id,
      name: "交互验证一",
      objective: "验证便利贴收起不会抢占点击",
      status: "active",
      mode: "normal",
    },
    select: { id: true },
  }),
  prisma.project.create({
    data: {
      userId: user.id,
      name: "交互验证二",
      objective: "验证切换文件夹只发生一次",
      status: "active",
      mode: "normal",
    },
    select: { id: true },
  }),
]);

await prisma.task.createMany({
  data: [
    {
      userId: user.id,
      projectId: firstProject.id,
      title: "第一项任务",
      shortTitle: "第一项任务",
      status: "todo",
      executionMode: "quick",
      doneWhen: "完成第一项",
      maxTurns: 1,
      toolPolicy: "none",
      planOrder: 0,
    },
    {
      userId: user.id,
      projectId: firstProject.id,
      title: "第二项任务",
      shortTitle: "第二项任务",
      status: "todo",
      executionMode: "quick",
      doneWhen: "完成第二项",
      maxTurns: 1,
      toolPolicy: "none",
      planOrder: 1,
    },
    {
      userId: user.id,
      projectId: secondProject.id,
      title: "另一个文件夹的任务",
      shortTitle: "另一个文件夹的任务",
      status: "todo",
      executionMode: "quick",
      doneWhen: "确认另一个文件夹能展开",
      maxTurns: 1,
      toolPolicy: "none",
      planOrder: 0,
    },
  ],
});

await prisma.userPreference.create({
  data: {
    userId: user.id,
    key: "first_run_tour",
    source: "system",
    value: "done",
  },
});

const token = issueSessionToken(user.id);

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    this.socket.close();
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHttp(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error("chrome debug port timeout");
}

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

let cdp;
try {
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const page = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: SESSION_COOKIE,
    value: token,
    url: `${baseUrl}/`,
    httpOnly: true,
    sameSite: "Lax",
  });

  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "eval failed");
    }
    return result.result?.value;
  };

  const waitFor = async (expression, timeoutMs = 20000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await evaluate(expression)) return true;
      await delay(150);
    }
    return false;
  };

  const click = async (selector, index = 0) => {
    const target = await evaluate(`(() => {
      const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!element) return null;
      element.scrollIntoView({ block: "center" });
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
      };
    })()`);
    if (!target) throw new Error(`找不到可点击元素：${selector}[${index}]`);
    await delay(250);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: target.x,
      y: target.y,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: target.x,
      y: target.y,
      button: "left",
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: target.x,
      y: target.y,
      button: "left",
      clickCount: 1,
    });
    await delay(500);
  };

  await cdp.send("Page.navigate", {
    url: `${baseUrl}/files?project=${firstProject.id}`,
  });
  const loaded = await waitFor(
    `document.querySelectorAll('[data-project-id="${firstProject.id}"] [data-tour="task-sticky"]').length === 2`,
  );
  if (!loaded) throw new Error("文件页没有加载出验证任务");
  // DOM 先出现、React 后 hydration；等事件真正挂上再点。
  await delay(1200);

  const taskSelector = `[data-project-id="${firstProject.id}"] [data-tour="task-sticky"]`;
  const statusSelector = `[data-project-id="${firstProject.id}"] [data-tour="task-next"]`;
  const firstFolderSelector = `[data-file-folder="${firstProject.id}"]`;
  const secondFolderSelector = `[data-file-folder="${secondProject.id}"]`;

  await click(taskSelector, 0);
  const firstExpanded = await evaluate(
    `document.querySelectorAll(${JSON.stringify(taskSelector)})[0]?.getAttribute("aria-expanded") === "true"`,
  );
  if (!firstExpanded) {
    const state = await evaluate(`(() => {
      const tasks = Array.from(document.querySelectorAll(${JSON.stringify(taskSelector)}));
      return {
        expanded: tasks.map((task) => task.getAttribute("aria-expanded")),
        text: tasks.map((task) => task.textContent?.trim()),
        boxes: tasks.map((task) => {
          const box = task.getBoundingClientRect();
          const hit = document.elementFromPoint(
            Math.round(box.x + box.width / 2),
            Math.round(box.y + box.height / 2),
          );
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            hit: hit?.textContent?.trim() ?? null,
          };
        }),
        viewport: { width: innerWidth, height: innerHeight },
      };
    })()`);
    throw new Error(`第一张便利贴没有正常展开：${JSON.stringify(state)}`);
  }

  await click(taskSelector, 1);
  const switchedTask = await evaluate(`(() => {
    const tasks = document.querySelectorAll(${JSON.stringify(taskSelector)});
    return tasks[0]?.getAttribute("aria-expanded") === "false" &&
      tasks[1]?.getAttribute("aria-expanded") === "true";
  })()`);
  if (!switchedTask) throw new Error("点另一个任务时，第一次点击被收起动作吞掉了");

  await click(statusSelector, 1);
  const statusAdvanced = await evaluate(
    `(() => {
      const tasks = document.querySelectorAll(${JSON.stringify(taskSelector)});
      const statuses = document.querySelectorAll(${JSON.stringify(statusSelector)});
      return statuses[1]?.textContent?.includes("进行") === true &&
        tasks[1]?.getAttribute("aria-expanded") === "false";
    })()`,
  );
  const savedStatus = await prisma.task.findFirst({
    where: { userId: user.id, title: "第二项任务" },
    select: { status: true },
  });
  if (!statusAdvanced || savedStatus?.status !== "in_progress") {
    throw new Error("点任务状态时，第一次点击没有直接推进任务");
  }

  await click(taskSelector, 0);
  await click(secondFolderSelector);
  const switchedFolder = await evaluate(`(() => {
    const first = document.querySelector(${JSON.stringify(firstFolderSelector)});
    const second = document.querySelector(${JSON.stringify(secondFolderSelector)});
    return first?.getAttribute("aria-expanded") === "false" &&
      second?.getAttribute("aria-expanded") === "true";
  })()`);
  if (!switchedFolder) {
    throw new Error("点另一个文件夹时，旧文件夹的收起逻辑把新文件夹切回去了");
  }

  const secondTaskSelector = `[data-project-id="${secondProject.id}"] [data-tour="task-sticky"]`;
  await click(secondTaskSelector, 0);
  const secondStickyOpened = await waitFor(
    `document.querySelector(${JSON.stringify(secondTaskSelector)})?.getAttribute("aria-expanded") === "true"`,
    2000,
  );
  if (!secondStickyOpened) throw new Error("切换文件夹后，便利贴没有展开");
  await delay(300);

  const blankPoint = await evaluate(`(() => {
    for (let y = 20; y < innerHeight - 20; y += 40) {
      for (let x = 220; x < innerWidth - 20; x += 40) {
        const element = document.elementFromPoint(x, y);
        if (!element) continue;
        if (element.closest("[data-file-folder-block]")) continue;
        if (element.closest("a, button, input, textarea, select, [role='button']")) continue;
        return { x, y };
      }
    }
    return null;
  })()`);
  if (!blankPoint) throw new Error("找不到可用于验证点外收起的空白区域");
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: blankPoint.x,
    y: blankPoint.y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: blankPoint.x,
    y: blankPoint.y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: blankPoint.x,
    y: blankPoint.y,
    button: "left",
    clickCount: 1,
  });
  const bodyClickClosedSticky = await waitFor(
    `(() => {
      const task = document.querySelector(${JSON.stringify(secondTaskSelector)});
      return !task || task.getAttribute("aria-expanded") === "false";
    })()`,
    2000,
  );
  if (!bodyClickClosedSticky) throw new Error("点空白处没有收起便利贴");

  console.log("PASS file-interactions");
} finally {
  cdp?.close();
  chrome.kill();
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
}
