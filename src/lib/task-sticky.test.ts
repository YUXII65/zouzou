import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeTaskStickyNote } from "@/lib/task-sticky";

function note(overrides: Partial<Parameters<typeof serializeTaskStickyNote>[0]> = {}) {
  return {
    id: "note-1",
    taskId: "task-1",
    sourceMessage: "想把这个任务推起来",
    title: "先做一件事",
    encouragement: "可以开始",
    stepsJson: JSON.stringify(["第一步", "第二步"]),
    nextStep: "先写第一段",
    createdAt: new Date("2026-09-17T02:00:00.000Z"),
    ...overrides,
  };
}

test("正常步骤 JSON 解析成数组", () => {
  const result = serializeTaskStickyNote(note());
  assert.deepEqual(result.steps, ["第一步", "第二步"]);
  assert.equal(result.taskId, "task-1");
});

test("坏掉的 JSON 不让页面崩，退回空数组", () => {
  const result = serializeTaskStickyNote(note({ stepsJson: "{ 不是数组" }));
  assert.deepEqual(result.steps, []);
});

test("JSON 不是数组时退回空数组", () => {
  assert.deepEqual(
    serializeTaskStickyNote(note({ stepsJson: JSON.stringify({ a: 1 }) })).steps,
    [],
  );
});

test("过滤掉非字符串和空白步骤", () => {
  const result = serializeTaskStickyNote(
    note({ stepsJson: JSON.stringify(["第一步", "", "   ", 42, null, "第二步"]) }),
  );
  assert.deepEqual(result.steps, ["第一步", "第二步"]);
});

test("createdAt 是 Date 或字符串都能输出 ISO", () => {
  assert.equal(
    serializeTaskStickyNote(note()).createdAt,
    "2026-09-17T02:00:00.000Z",
  );
  assert.equal(
    serializeTaskStickyNote(note({ createdAt: "2026-09-17T02:00:00.000Z" }))
      .createdAt,
    "2026-09-17T02:00:00.000Z",
  );
});
