import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [target] : [];
  });
}

test("原生按钮和链接不添加浏览器 title 悬浮提示", () => {
  const offenders = [];
  for (const file of walk(path.join(root, "src"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/<(?:button|a|Link|input)\b[\s\S]*?>/g)) {
      if (/\btitle\s*=/.test(match[0])) {
        offenders.push(path.relative(root, file));
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], []);
});

test("澄清等待和完成态文案两端一致", () => {
  const read = (relative) =>
    fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
  const mini = read("miniprogram/pages/today/today.js");
  const web = [
    "src/components/quick-capture.tsx",
    "src/app/welcome/first-run-guide.tsx",
    "src/app/api/ai/inbox/clarify/route.ts",
    "src/components/ai-task-planner.tsx",
    "src/components/chat-clarify.tsx",
    "src/components/inbox-clarification.tsx",
  ]
    .map(read)
    .join("\n");

  for (const text of [
    "正在读你的话",
    "正在理解你",
    "正在思考中",
    "正在补充信息",
    "正在确认情况",
    "正在整理信息",
    "已整理到文件，可以去看看。",
    "去看看",
  ]) {
    assert.ok(mini.includes(text), `小程序缺少统一文案：${text}`);
    assert.ok(web.includes(text), `网页缺少统一文案：${text}`);
  }

  for (const text of [
    "我在听，先别急着整理…",
    "正在找最关键的那一点…",
    "正在把选项写得更好选…",
    "快问清楚了…",
    "正在想下一个问题…",
    "再确认一点就够…",
    "正在收成能开始的第一步…",
    "正在排先后顺序…",
    "快整理好了…",
    "明白了，已整理完成",
  ]) {
    assert.ok(!web.includes(text), `网页仍包含旧文案：${text}`);
  }
});

test("主页面统一使用网页同款头部和底部导航图标", () => {
  const read = (relative) =>
    fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

  for (const page of ["today", "workspace", "profile"]) {
    const wxml = read("miniprogram/pages/" + page + "/" + page + ".wxml");
    assert.ok(wxml.includes("<app-header"), page + " 缺少网页同款头部");
    assert.ok(wxml.includes("<site-footer"), page + " 缺少网页同款页脚");
  }

  const tabBar = read("miniprogram/custom-tab-bar/index.wxml");
  for (const icon of ["nav-home", "nav-files", "nav-profile"]) {
    assert.ok(tabBar.includes(icon), "自定义 tabBar 缺少 " + icon + " 图标");
  }
});

test("小程序欢迎流程开关与网页保持一致", () => {
  const read = (relative) =>
    fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
  const web = read("src/lib/entry-policy.ts");
  const mini = read("miniprogram/config.js");
  const webEnabled = /FIRST_RUN_GUIDE_ENABLED\s*=\s*true/.test(web);
  const miniEnabled = /onboardingFlowEnabled\s*=\s*true/.test(mini);
  assert.equal(miniEnabled, webEnabled, "网页与小程序的新手欢迎流程开关不一致");
});
