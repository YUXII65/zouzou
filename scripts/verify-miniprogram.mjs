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