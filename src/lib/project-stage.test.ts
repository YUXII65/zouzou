import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStageGate } from "@/lib/project-stage";

test("空阶段不能直接判定完成", () => {
  assert.equal(evaluateStageGate([]).state, "active");
});

test("有未完成任务时阶段保持 active", () => {
  const gate = evaluateStageGate([{ status: "done" }, { status: "in_progress" }]);
  assert.equal(gate.state, "active");
  assert.equal(gate.open, 1);
});

test("取消任务不能被当成完成", () => {
  const gate = evaluateStageGate([{ status: "done" }, { status: "cancelled" }]);
  assert.equal(gate.state, "active");
  assert.equal(gate.cancelled, 1);
});

test("全部任务完成后阶段进入 ready", () => {
  const gate = evaluateStageGate([{ status: "done" }, { status: "done" }]);
  assert.equal(gate.state, "ready");
  assert.equal(gate.done, 2);
});
