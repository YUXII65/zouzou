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
