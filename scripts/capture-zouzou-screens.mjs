import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "xiaohongshu-recruitment-real");
const meta = JSON.parse(fs.readFileSync(path.join(outDir, "demo-meta.json"), "utf8"));
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const debugPort = 9333;
const baseUrl = "http://127.0.0.1:3307";
const chromeProfile = path.join(os.tmpdir(), `zouzou-xhs-${Date.now()}`);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

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

const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${chromeProfile}`,
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-sandbox",
  "--disable-background-networking",
  "--window-size=540,720",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let cdp;
try {
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const pageResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  const page = await pageResponse.json();
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 540,
    height: 720,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 540,
    screenHeight: 720,
  });
  await cdp.send("Network.setCookie", {
    name: "next_step_session",
    value: meta.sessionToken,
    url: `${baseUrl}/`,
    httpOnly: true,
    sameSite: "Lax",
  });

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result?.value;
  }

  async function waitForExpression(expression, timeoutMs = 25000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(expression)) return;
      await delay(200);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  async function navigate(url, readyExpression) {
    await cdp.send("Page.navigate", { url });
    await waitForExpression(`document.readyState === "complete"`);
    if (readyExpression) await waitForExpression(readyExpression);
    await evaluate("document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true");
    await delay(900);
  }

  async function screenshot(filename) {
    const result = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(outDir, filename), Buffer.from(result.data, "base64"));
    console.log(`saved ${filename}`);
  }

  async function scrollToText(text) {
    return evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll('.zouzou-panel, section, main > div'));
      const target = nodes.find((node) => node.textContent && node.textContent.includes(${JSON.stringify(text)}));
      if (!target) return false;
      target.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -16);
      return true;
    })()`);
  }

  await navigate(`${baseUrl}/`, `document.body.textContent.includes("今天要做")`);
  await evaluate("window.scrollTo(0, 0); true");
  await delay(500);
  await screenshot("01-home.png");

  await scrollToText("今天要做");
  await delay(500);
  await screenshot("02-today-tasks.png");

  await navigate(`${baseUrl}/workspace`, `document.body.textContent.includes("个人成长账号")`);
  await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('.zouzou-row-hover'));
    const row = rows.find((node) => node.textContent && node.textContent.includes('发出第一条内容'));
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await delay(500);
  await screenshot("03-workspace.png");

  const clicked = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('.zouzou-row-hover'));
    const row = rows.find((node) => node.textContent && node.textContent.includes('发出第一条内容'));
    const button = row?.querySelector('button[aria-label^="便利贴"]');
    if (!button) return false;
    button.click();
    row.scrollIntoView({ block: "start" });
    window.scrollBy(0, -8);
    return true;
  })()`);
  if (clicked) {
    await delay(800);
    await screenshot("04-sticky.png");
  }

  await navigate(`${baseUrl}/review`, 'document.body.textContent.includes("当日复盘")');
  await delay(500);
  await screenshot("05-review.png");
} finally {
  if (cdp) cdp.close();
  chrome.kill();
}




