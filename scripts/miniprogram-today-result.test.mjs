import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  canShowCaptureClarification,
  isUsableInboxPlan,
  normalizeTodayResult,
} = require("../miniprogram/utils/today-result.js");

test("normalizeTodayResult supports legacy today cache", () => {
  const result = normalizeTodayResult({
    date: "2026-10-16",
    pendingInbox: 1,
    pendingItems: [{ id: "inbox-1" }],
    tasks: [{ id: "task-1" }],
  });

  assert.deepEqual(result.pendingInbox, [{ id: "inbox-1" }]);
  assert.deepEqual(result.plannedTasks, [{ id: "task-1" }]);
  assert.deepEqual(result.completedTodayTasks, []);
});

test("normalizeTodayResult keeps the current today contract", () => {
  const result = normalizeTodayResult({
    pendingInbox: [{ id: "inbox-1" }],
    plannedTasks: [{ id: "task-1" }],
    completedTodayTasks: [{ id: "task-2" }],
  });

  assert.deepEqual(result.pendingInbox, [{ id: "inbox-1" }]);
  assert.deepEqual(result.plannedTasks, [{ id: "task-1" }]);
  assert.deepEqual(result.completedTodayTasks, [{ id: "task-2" }]);
});

test("首条 socratic 问题即使 dimensions 为空也必须先渲染澄清", () => {
  const response = {
    result: {
      itemId: "inbox-1",
      clarification: {
        mode: "socratic",
        status: "asking",
        dimensions: [],
        history: [
          {
            key: "context",
            question: "你现在具体卡在哪里？",
            options: ["不知道从哪开始", "一直拖着"],
            answer: [],
          },
        ],
      },
    },
  };

  assert.equal(canShowCaptureClarification(response), true);
});

test("提交结果缺少澄清状态时不能自动落计划", () => {
  assert.equal(canShowCaptureClarification({ result: { itemId: "inbox-1" } }), false);
});

test("失败降级计划不能被自动确认进文件", () => {
  assert.equal(isUsableInboxPlan({ source: "agent_failed", tasks: [] }), false);
  assert.equal(isUsableInboxPlan({ source: "heuristic_fallback", tasks: [{ title: "散落任务" }] }), false);
});

test("正常计划必须带任务或直接回答", () => {
  assert.equal(isUsableInboxPlan({ source: "model", tasks: [] }), false);
  assert.equal(isUsableInboxPlan({ source: "model", tasks: [{ title: "下一步" }] }), true);
  assert.equal(isUsableInboxPlan({ source: "model", action: "answer", directAnswer: "答案" }), true);
});
