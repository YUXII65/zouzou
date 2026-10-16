import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * 落地页演示场景：网页（src/app/landing/landing-demo.tsx）和小程序
 * （miniprogram/pages/index/demo-data.js）各存了一份，内容必须一致。
 * 只比 scenario 的 tab 与 idea —— 这两项漂了，演示就会和产品讲的不一样。
 */
function extract(source) {
  const blocks = [...source.matchAll(/tab:\s*"([^"]+)",\s*\n\s*idea:\s*"([^"]+)"/g)];
  return blocks.map((match) => ({ tab: match[1], idea: match[2] }));
}

test("落地页演示场景两端一致", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const web = fs.readFileSync(
    path.join(root, "src", "app", "landing", "landing-demo.tsx"),
    "utf8",
  );
  const mini = fs.readFileSync(
    path.join(root, "miniprogram", "pages", "index", "demo-data.js"),
    "utf8",
  );

  const webScenarios = extract(web);
  const miniScenarios = extract(mini);

  assert.ok(webScenarios.length >= 4, "网页演示场景解析为空或过少");
  assert.deepEqual(
    miniScenarios,
    webScenarios,
    "小程序演示场景与网页不一致，请同步 miniprogram/pages/index/demo-data.js",
  );
});