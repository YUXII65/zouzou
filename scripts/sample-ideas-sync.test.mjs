import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * 示例池的唯一来源是 src/lib/sample-ideas.ts；小程序那份是生成产物。
 * 两边不同步时这条测试会失败，跑 scripts/sync-sample-ideas.mjs 重新生成。
 */
function extract(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => ({
    title: match[1],
    content: match[2],
  }));
}

test("小程序示例池与网页同源", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const web = fs.readFileSync(
    path.join(root, "src", "lib", "sample-ideas.ts"),
    "utf8",
  );
  const mini = fs.readFileSync(
    path.join(root, "miniprogram", "utils", "sample-ideas.js"),
    "utf8",
  );

  const webEntries = extract(
    web,
    /\{\s*title:\s*"([^"]+)",\s*content:\s*"([^"]+)"\s*\}/g,
  );
  const miniEntries = extract(
    mini,
    /"title":\s*"([^"]+)",\s*\n\s*"content":\s*"([^"]+)"/g,
  );

  assert.ok(webEntries.length > 0, "网页示例池解析为空");
  assert.deepEqual(
    miniEntries,
    webEntries,
    "小程序示例池与网页不一致，运行 node scripts/sync-sample-ideas.mjs 重新生成",
  );
});