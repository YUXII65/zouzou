#!/usr/bin/env node
/**
 * 走走 · 小程序提审前检查（自动部分）
 *
 * 用法：pnpm check:review
 *
 * 覆盖：
 *  1. 现有门禁：typecheck / lint / test / verify:miniprogram / check:online
 *  2. 提审特有静态检查：apiBase、appid、主包体积、页面文件完整、require 的模块是否存在
 *  3. 版本控制：miniprogram/ 里有没有「本地有、git 没有」的文件
 *
 * 不覆盖（脚本查不到，必须人工确认）：
 *  微信平台侧配置（小程序备案 / 域名 ICP 备案 / request 合法域名 / 服务类目 /
 *  用户隐私保护指引）、真机表现、审核员的主观判断。
 *  人工清单见 docs/miniprogram-review-checklist.md。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const mpDir = path.join(root, "miniprogram");
const LIMIT = 2 * 1024 * 1024;
const results = [];

const TAGS = { ok: "  ok  ", note: " note ", risk: " RISK ", fail: " FAIL " };

function report(level, name, detail) {
  results.push({ level, name, detail });
  console.log(`${TAGS[level]} ${name}${detail ? ` — ${detail}` : ""}`);
}

function head(text) {
  console.log(`\n${text}`);
}

function git(args) {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return (res.stdout || "").trim();
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

function walk(dir, ext) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, ext));
    else if (entry.name.endsWith(ext)) files.push(full);
  }
  return files;
}

console.log("走走 · 小程序提审前检查");
console.log("=".repeat(48));

/* ---------- 1. 现有门禁 ---------- */
head("【1】现有门禁");

const gates = [
  ["typecheck", "pnpm typecheck"],
  ["lint", "pnpm lint"],
  ["test", "pnpm test"],
  ["verify:miniprogram", "pnpm verify:miniprogram"],
  ["check:online", "pnpm check:online"],
];

for (const [name, command] of gates) {
  const started = Date.now();
  const res = spawnSync(command, { cwd: root, shell: true, encoding: "utf8" });
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (res.status !== 0) {
    report("fail", name, `${command} 退出码 ${res.status}（${seconds}s）`);
    const tail = out.split("\n").map((line) => line.trimEnd()).filter(Boolean).slice(-12);
    for (const line of tail) console.log(`       ${line}`);
    continue;
  }

  if (name === "lint") {
    const m = out.match(/\((\d+) errors?, (\d+) warnings?\)/);
    report("ok", name, m ? `${m[1]} error / ${m[2]} warning` : "通过");
  } else if (name === "test") {
    const m = out.match(/\u2139 pass (\d+)/);
    report("ok", name, m ? `${m[1]} 个用例通过` : "通过");
  } else if (name === "check:online") {
    const m = out.match(/(\d+)\/(\d+) 项通过/);
    report("ok", name, m ? `${m[1]}/${m[2]} 项通过` : "通过");
  } else {
    report("ok", name, `通过（${seconds}s）`);
  }
}

/* ---------- 2. 提审配置与包体 ---------- */
head("【2】提审配置与包体");

try {
  const src = fs.readFileSync(path.join(mpDir, "config.js"), "utf8");
  const apiBase = src.match(/apiBase\s*=\s*"([^"]*)"/)?.[1] ?? "";
  const cloudEnv = src.match(/cloudEnv\s*=\s*"([^"]*)"/)?.[1] ?? "";

  if (!/^https:\/\//.test(apiBase) || /localhost|127\.0\.0\.1/.test(apiBase)) {
    report("fail", "apiBase", `当前是「${apiBase || "空"}」，真机必须指向已备案的 https 域名`);
  } else {
    report("ok", "apiBase", apiBase);
  }

  if (cloudEnv) {
    report("ok", "cloudEnv", `已配置 ${cloudEnv}，真机走云函数代理`);
  } else {
    report("note", "cloudEnv", "为空 → 真机走 wx.request，前提是域名已 ICP 备案且已加入 request 合法域名");
  }
} catch (error) {
  report("fail", "config.js", `读不到或解析失败：${error.message}`);
}

try {
  const project = JSON.parse(fs.readFileSync(path.join(mpDir, "project.config.json"), "utf8"));
  if (/^wx[0-9a-f]{16}$/i.test(project.appid || "")) {
    report("ok", "appid", project.appid);
  } else {
    report("fail", "appid", `project.config.json 里的 appid 是「${project.appid || "空"}」`);
  }
} catch (error) {
  report("fail", "project.config.json", error.message);
}

try {
  const bytes = dirSize(mpDir);
  report(
    bytes < LIMIT ? "ok" : "fail",
    "主包体积",
    `${(bytes / 1024).toFixed(1)} KB / 上限 ${LIMIT / 1024} KB（含 cloudfunctions，实际主包更小）`,
  );
} catch (error) {
  report("fail", "主包体积", error.message);
}

/* ---------- 3. 页面与模块完整性 ---------- */
head("【3】页面与模块完整性");

try {
  const app = JSON.parse(fs.readFileSync(path.join(mpDir, "app.json"), "utf8"));
  const missing = [];
  for (const page of app.pages || []) {
    for (const ext of [".js", ".wxml"]) {
      const file = path.join(mpDir, `${page}${ext}`);
      if (!fs.existsSync(file)) missing.push(`${page}${ext}`);
    }
  }
  if (missing.length) report("fail", "app.json 页面文件", `缺 ${missing.join("、")}`);
  else report("ok", "app.json 页面文件", `${(app.pages || []).length}/${(app.pages || []).length} 个页面齐全`);
} catch (error) {
  report("fail", "app.json", error.message);
}

const missingModules = [];
for (const file of walk(mpDir, ".js")) {
  const src = fs.readFileSync(file, "utf8");
  for (const match of src.matchAll(/require\("([^"]+)"\)/g)) {
    const target = match[1];
    if (!target.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), target);
    const exists = [resolved, `${resolved}.js`, path.join(resolved, "index.js")].some((candidate) =>
      fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (!exists) missingModules.push(`${path.relative(root, file)} → ${target}`);
  }
}
if (missingModules.length) report("fail", "require 的模块", `找不到：${missingModules.join("；")}`);
else report("ok", "require 的模块", "全部存在");

const leftover = [];
for (const file of walk(mpDir, ".js")) {
  const src = fs.readFileSync(file, "utf8");
  for (const pattern of ["localhost", "127.0.0.1", "TODO", "FIXME"]) {
    if (src.includes(pattern)) leftover.push(`${path.relative(root, file)}:${pattern}`);
  }
}
if (leftover.length) report("note", "残留调试痕迹", leftover.join("、"));
else report("ok", "残留调试痕迹", "没有 localhost / TODO / FIXME");

/* ---------- 4. 版本控制 ---------- */
head("【4】版本控制（提审包就是这个目录）");

// 不用 git status 的文本格式：不同 git 版本对前置空格的输出不一致，容易切错文件名。
// 直接比「本地文件」和「已被 git 跟踪的文件」，再用 check-ignore 排除有意忽略的文件。
const toPosix = (value) => value.split("\\").join("/");
const tracked = new Set(git(["ls-files", "--", "miniprogram"]).split("\n").filter(Boolean).map(toPosix));
const localFiles = walk(mpDir, "").map((file) => toPosix(path.relative(root, file)));
const notTracked = localFiles.filter((file) => !tracked.has(file));

let untracked = notTracked;
if (notTracked.length) {
  const ignored = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: root,
    input: notTracked.join("\n"),
    encoding: "utf8",
  });
  const ignoredSet = new Set((ignored.stdout || "").split("\n").filter(Boolean).map(toPosix));
  untracked = notTracked.filter((file) => !ignoredSet.has(file));
}

const changed = new Set(
  [...git(["diff", "--name-only", "--", "miniprogram"]).split("\n"), ...git(["diff", "--cached", "--name-only", "--", "miniprogram"]).split("\n")]
    .filter(Boolean)
    .map(toPosix),
);

if (!untracked.length && !changed.size) {
  report("ok", "miniprogram/", "与 git 已提交内容一致");
} else {
  for (const file of untracked.sort()) {
    report("risk", file, "未纳入 git：这次上传会带上它，但换台机器或清理后就会丢");
  }
  for (const file of [...changed].sort()) {
    report("note", file, "有未提交改动：确认本地这一版就是要提审的版本");
  }
}

const branch = git(["branch", "--show-current"]);
if (branch) report("note", "当前分支", branch);

/* ---------- 汇总 ---------- */
const count = (level) => results.filter((r) => r.level === level).length;
const blocked = count("fail") + count("risk");

head("【提审前必须人工确认的 6 项】");
for (const item of [
  "小程序备案是否已完成（未完成不能提交审核）",
  "域名 ICP 备案是否已通过，且 nextstep9.work 已加入 request 合法域名",
  "服务类目是否为「工具 > 效率」这类无需前置审批的类目",
  "《用户隐私保护指引》与实际采集的信息一致（账号 / 昵称 / 头像 / 记录内容）",
  "上传时填的版本号与备注，备注里写清审核员怎么体验（含测试账号）",
  "真机扫体验版二维码，把 docs/miniprogram-review-checklist.md 第 3 节逐条点一遍",
]) {
  console.log(`  [ ] ${item}`);
}

head("汇总");
console.log(
  `  通过 ${count("ok")} 项，提示 ${count("note")} 项，风险 ${count("risk")} 项，失败 ${count("fail")} 项`,
);
if (blocked) {
  console.log("  有 RISK / FAIL：先处理上面标红的项，再提审。");
  process.exit(1);
}
console.log("  自动检查全部通过：剩下的只有【提审前必须人工确认的 6 项】。");