import { test } from "node:test";
import assert from "node:assert/strict";
import { isInsideFloatingLayer } from "@/lib/use-click-outside";

/**
 * 回归：新手引导气泡挂在 body 上（createPortal），点它的关闭按钮时
 * mousedown 会先冒到 document。如果不忽略浮动层，下层面板会先被收掉、
 * 气泡被卸载，关闭按钮自己的 onClick 永远不执行，引导步骤卡在原地。
 */
test("浮动层内的点击不算点在外面", () => {
  assert.equal(isInsideFloatingLayer({ closest: () => ({}) }), true);
});

test("普通区域、空值、非元素都不算浮动层", () => {
  assert.equal(isInsideFloatingLayer({ closest: () => null }), false);
  assert.equal(isInsideFloatingLayer(null), false);
  assert.equal(isInsideFloatingLayer(undefined), false);
  assert.equal(isInsideFloatingLayer("text"), false);
  assert.equal(isInsideFloatingLayer({}), false);
});
