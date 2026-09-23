#!/usr/bin/env node
/**
 * 线上就绪检查。
 *
 * 每次部署后、以及备案通过恢复解析后跑一次，确认站点不是「看着像回来了，其实还是坏的」。
 * 检查项都来自真踩过的坑：
 *   - CSS 404 被 immutable 头缓存（发布窗口中间态）
 *   - 鉴权路由被误改成公开
 *   - 证书到期没人管
 *   - 小程序主包超过微信 2MB 上限传不上去
 *
 * 用法：node scripts/check-online-readiness.mjs [https://nextstep9.work]
 */
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import tls from "node:tls";

const base = (process.argv[2] || "https://nextstep9.work").replace(/\/$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MINIPROGRAM_LIMIT = 2 * 1024 * 1024;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}  ${detail ?? ""}`);
}

async function get(url, options = {}) {
  const res = await fetch(url, { redirect: "follow", ...options });
  return res;
}

async function checkHomeAndCss() {
  const res = await get(`${base}/`);
  const html = await res.text();
  record("首页可访问", res.status === 200, `HTTP ${res.status}`);

  const match = html.match(/href="(\/_next\/static\/css\/[^"]+\.css)"/);
  if (!match) {
    // 线上没有引用 CSS 不一定是错，但必须说清楚没验到，不能当通过。
    record("首页引用 CSS", false, "HTML 里找不到 /_next/static/css/*.css 引用");
    return;
  }
  const cssUrl = `${base}${match[1]}?asset-retry=${Date.now()}`;
  const cssRes = await get(cssUrl);
  const type = cssRes.headers.get("content-type") || "";
  record(
    "CSS 资源就绪",
    cssRes.status === 200 && type.includes("text/css"),
    `HTTP ${cssRes.status} ${type}`,
  );
}

async function checkApi() {
  const health = await get(`${base}/api/health`);
  record("/api/health", health.status === 200, `HTTP ${health.status}`);

  // 鉴权路由必须仍然拦人；返回 200 说明守卫被拆了。
  for (const route of ["/api/miniprogram/me", "/api/miniprogram/today"]) {
    const res = await get(`${base}${route}`);
    record(`${route} 仍受保护`, res.status === 401, `HTTP ${res.status}（期望 401）`);
  }

  const login = await get(`${base}/api/miniprogram/auth/login`, { method: "POST" });
  record(
    "登录接口存在（拒绝空请求）",
    login.status === 400 || login.status === 401,
    `HTTP ${login.status}（期望 400/401）`,
  );
}

function checkCertificate() {
  return new Promise((resolve) => {
    const host = new URL(base).hostname;
    const socket = tls.connect({ host, servername: host, port: 443 }, () => {
      const cert = socket.getPeerCertificate();
      const days = Math.round((new Date(cert.valid_to) - Date.now()) / 86400000);
      record(
        "HTTPS 证书",
        days > 14,
        `颁发给 ${cert.subject?.CN ?? "?"}，${days} 天后到期`,
      );
      socket.end();
      resolve();
    });
    socket.on("error", (error) => {
      record("HTTPS 证书", false, error.message);
      resolve();
    });
    socket.setTimeout(15000, () => {
      socket.destroy();
      record("HTTPS 证书", false, "连接超时");
      resolve();
    });
  });
}

async function miniprogramSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await miniprogramSize(full);
    } else {
      total += (await stat(full)).size;
    }
  }
  return total;
}

async function checkMiniprogram() {
  const dir = path.join(root, "miniprogram");
  try {
    const bytes = await miniprogramSize(dir);
    record(
      "小程序主包体积",
      bytes < MINIPROGRAM_LIMIT,
      `${(bytes / 1024).toFixed(1)} KB / 上限 2048 KB`,
    );
  } catch (error) {
    record("小程序主包体积", false, error.message);
  }
}

console.log(`检查目标：${base}\n`);

async function guard(name, fn) {
  try {
    await fn();
  } catch (error) {
    // 域名不通（备案期间解析被删掉就是这个状态）要报成一条清楚的失败项，
    // 不能抛栈崩掉——否则看不出到底哪一项挂了。
    record(name, false, error.message);
  }
}

await guard("首页与 CSS 资源", checkHomeAndCss);
await guard("API 与鉴权", checkApi);
await guard("HTTPS 证书", checkCertificate);
await guard("小程序包体积", checkMiniprogram);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  console.log("未通过：" + failed.map((f) => f.name).join("、"));
  process.exit(1);
}