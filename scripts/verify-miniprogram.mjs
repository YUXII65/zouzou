/**
 * 小程序静态检查：
 * 1. WXML 里绑定的事件在 JS 里都有实现（防止改名漏改）；
 * 2. <view> 标签成对（防止改 WXML 时漏闭合）。
 *
 * 小程序没法在 CI 里真机跑，这个检查是最低成本的回归门禁。
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pagesDir = path.join(root, "miniprogram", "pages");
const pages = fs
  .readdirSync(pagesDir)
  .filter((name) => fs.statSync(path.join(pagesDir, name)).isDirectory());

let issues = 0;
const app = JSON.parse(fs.readFileSync(path.join(root, "miniprogram", "app.json"), "utf8"));
const tabPages = ["pages/today/today", "pages/workspace/workspace", "pages/profile/profile"];
const tabList = app.tabBar && Array.isArray(app.tabBar.list) ? app.tabBar.list.map((item) => item.pagePath) : [];
const tabBarIssues = [];

if (!app.tabBar || app.tabBar.custom !== true) {
  tabBarIssues.push("app.json 必须开启自定义 tabBar");
}
for (const page of tabPages) {
  if (!tabList.includes(page)) tabBarIssues.push("tabBar 缺少 " + page);
}
for (const file of ["index.js", "index.json", "index.wxml", "index.wxss"]) {
  if (!fs.existsSync(path.join(root, "miniprogram", "custom-tab-bar", file))) {
    tabBarIssues.push("custom-tab-bar/" + file + " 不存在");
  }
}
if (tabBarIssues.length) {
  for (const issue of tabBarIssues) console.error("✖ " + issue);
  issues += tabBarIssues.length;
} else {
  console.log("✔ tabBar: 三个主页面使用自定义 tabBar");
}

const tabPageSet = new Set(tabPages);

const todaySource = fs.readFileSync(path.join(pagesDir, "today", "today.js"), "utf8").replace(/\r\n/g, "\n");
for (const forbidden of ["先回答一个问题", "正在想下一问"]) {
  if (todaySource.includes(forbidden)) {
    console.error("✖ today: 仍包含旧澄清提示 " + forbidden);
    issues += 1;
  }
}
const todayWxmlForFlow = fs.readFileSync(path.join(pagesDir, "today", "today.wxml"), "utf8");
for (const forbidden of ["先回答一个问题", "正在想下一问"]) {
  if (todayWxmlForFlow.includes(forbidden)) {
    console.error("✖ today: WXML 仍包含旧澄清结构 " + forbidden);
    issues += 1;
  }
}
if (todayWxmlForFlow.includes('wx:if="{{pending.reason}}"')) {
  console.error("✖ today: 完成前仍在展示旧版计划解释段");
  issues += 1;
}
const apiSourceForPlan = fs.readFileSync(path.join(root, "miniprogram", "utils", "api.js"), "utf8");
if (!apiSourceForPlan.includes("response && response.plan ? response.plan : response")) {
  console.error("✖ api.planInbox: 必须解开服务端 plan 包装");
  issues += 1;
}

const submitMatch = todaySource.match(/onSubmit\(\) \{([\s\S]*?)\n  \},\n\n  onClarifyOptionTap/);
if (!submitMatch) {
  console.error("✖ today.onSubmit: 无法定位提交逻辑");
  issues += 1;
} else if (/planInbox|finishResolvedPlan|confirmPlan/.test(submitMatch[1])) {
  console.error("✖ today.onSubmit: 输入后不能自动生成计划或确认进文件夹，必须先展示澄清");
  issues += 1;
}

for (const page of pages) {
  if (!tabPageSet.has("pages/" + page + "/" + page)) continue;
  const wxml = fs.readFileSync(path.join(pagesDir, page, page + ".wxml"), "utf8");
  if (wxml.includes("<bottom-nav")) {
    console.error("✖ " + page + ": tabBar 页面不应再渲染 bottom-nav，否则会出现两层导航");
    issues += 1;
  }
}

const stickyComponentDir = path.join(root, "miniprogram", "components", "task-sticky");
const stickyWxmlPath = path.join(stickyComponentDir, "task-sticky.wxml");
const stickyJsPath = path.join(stickyComponentDir, "task-sticky.js");
if (!fs.existsSync(stickyWxmlPath) || !fs.existsSync(stickyJsPath)) {
  console.error("✖ task-sticky: 组件文件不完整");
  issues += 1;
} else {
  const stickyWxml = fs.readFileSync(stickyWxmlPath, "utf8");
  const stickyJs = fs.readFileSync(stickyJsPath, "utf8");
  const stickyHandlers = [
    ...new Set(
      [...stickyWxml.matchAll(/(?:bind(?:tap|input|confirm)|catchtap)="([A-Za-z0-9_]+)"/g)]
        .map((match) => match[1]),
    ),
  ];
  for (const handler of stickyHandlers) {
    if (!new RegExp("\\n\\s{2,8}" + handler + "\\s*\\(").test(stickyJs)) {
      console.error("✖ task-sticky: WXML 绑定了 " + handler + "，JS 里没有实现");
      issues += 1;
    }
  }
}

for (const page of ["today", "workspace"]) {
  const wxml = fs.readFileSync(path.join(pagesDir, page, page + ".wxml"), "utf8");
  if (!wxml.includes("<task-sticky")) {
    console.error("✖ " + page + ": 任务展开必须使用网页同款 task-sticky 组件");
    issues += 1;
  }
  for (const legacy of ["现在可以做", "task-sticky-title", "task-sticky-next", "task-detail-title"]) {
    if (wxml.includes(legacy)) {
      console.error("✖ " + page + ": 便利贴仍在展示旧版内容 " + legacy);
      issues += 1;
    }
  }
}

function walkJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkJs(target);
    return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });
}

for (const file of walkJs(path.join(root, "miniprogram"))) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (/wx\.reLaunch\s*\([\s\S]{0,160}?url:\s*["']\/(pages\/today\/today|pages\/workspace\/workspace|pages\/profile\/profile)["']/.test(source)) {
    console.error("✖ " + rel + ": 主页面必须用 wx.switchTab，不能用 reLaunch 重建");
    issues += 1;
  }
}

for (const page of pages) {
  const wxmlPath = path.join(pagesDir, page, `${page}.wxml`);
  const jsPath = path.join(pagesDir, page, `${page}.js`);
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) continue;

  const wxml = fs.readFileSync(wxmlPath, "utf8");
  const js = fs.readFileSync(jsPath, "utf8");
  const handlers = [
    ...new Set(
      [
        ...wxml.matchAll(
          /(?:bind(?:tap|input|change|confirm)|catchtap)="([A-Za-z0-9_]+)"/g,
        ),
      ].map((match) => match[1]),
    ),
  ];

  for (const handler of handlers) {
    if (!new RegExp(`\\n  ${handler}\\s*\\(`).test(js)) {
      console.error(`✖ ${page}: WXML 绑定了 ${handler}，JS 里没有实现`);
      issues += 1;
    }
  }

  const open = (wxml.match(/<view\b/g) || []).length;
  const close = (wxml.match(/<\/view>/g) || []).length;
  if (open !== close) {
    console.error(`✖ ${page}: <view> 标签不配对（${open}/${close}）`);
    issues += 1;
  }

  console.log(`✔ ${page}: ${handlers.length} 个事件，<view> ${open}/${close}`);
}

if (issues) {
  console.error(`小程序静态检查失败：${issues} 项`);
  process.exit(1);
}
console.log("小程序静态检查通过");