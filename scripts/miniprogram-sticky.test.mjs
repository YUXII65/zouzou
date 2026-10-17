import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeStickySteps } = require("../miniprogram/utils/sticky.js");

test("便利贴只保留可执行步骤并去掉序号前缀", () => {
  assert.deepEqual(
    normalizeStickySteps({ steps: ["1. 把时间线压成三句话", "2、先和伴侣对口径"], nextStep: "" }),
    ["把时间线压成三句话", "先和伴侣对口径"],
  );
});

test("没有 steps 时回退到 nextStep", () => {
  assert.deepEqual(
    normalizeStickySteps({ steps: [], nextStep: "把桌面清空" }),
    ["把桌面清空"],
  );
});
