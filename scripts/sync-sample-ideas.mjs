/**
 * 把网页的示例池（src/lib/sample-ideas.ts）同步成小程序能 require 的 JS。
 *
 * 网页是唯一来源；小程序那份不再手改。改完示例池跑：
 *   node scripts/sync-sample-ideas.mjs
 * 门禁见 scripts/sample-ideas-sync.test.mjs（不同步会挂在 pnpm test）。
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "src", "lib", "sample-ideas.ts");
const targetPath = path.join(root, "miniprogram", "utils", "sample-ideas.js");

const source = fs.readFileSync(sourcePath, "utf8");
const entries = [
  ...source.matchAll(
    /\{\s*title:\s*"([^"]+)",\s*content:\s*"([^"]+)"\s*\}/g,
  ),
].map((match) => ({ title: match[1], content: match[2] }));

if (!entries.length) {
  console.error("没有从 src/lib/sample-ideas.ts 解析到示例，检查格式是否变了。");
  process.exit(1);
}

const data = entries
  .map(
    (entry) =>
      "  {\n" +
      `    "title": ${JSON.stringify(entry.title)},\n` +
      `    "content": ${JSON.stringify(entry.content)}\n` +
      "  }",
  )
  .join(",\n");

const output = `// 该文件由 scripts/sync-sample-ideas.mjs 从 src/lib/sample-ideas.ts 生成，请勿手改。
const sampleIdeas = [
${data}
];

function sampleIdeasForDate(count = 3) {
  const start = (new Date().getDate() * 7) % sampleIdeas.length;
  return Array.from({ length: count }, (_, index) => sampleIdeas[(start + index) % sampleIdeas.length]);
}

function pickRandomSampleIdeas(count = 3) {
  const copy = [...sampleIdeas];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy.slice(0, count);
}

module.exports = { sampleIdeasForDate, pickRandomSampleIdeas };
`;

fs.writeFileSync(targetPath, output);
console.log(`已同步 ${entries.length} 条示例到 miniprogram/utils/sample-ideas.js`);