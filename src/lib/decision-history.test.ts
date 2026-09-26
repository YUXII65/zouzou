import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDecisionHistory,
  inferredPreferenceSummary,
} from "@/lib/decision-history";

test("决策历史会把反馈事件整理成可读因果记录", () => {
  const history = buildDecisionHistory([
    {
      id: "a",
      action: "task_delayed",
      detail: "用户延后了任务截止日期",
      createdAt: new Date("2026-09-27T10:00:00.000Z"),
      task: { title: "整理访谈记录" },
      inboxItem: null,
    },
    {
      id: "b",
      action: "suggestion_useless",
      detail:
        '今天整理访谈 / 太累了；DecisionSession：{"explanation":"上次延期两次，这次降低任务密度"}',
      createdAt: new Date("2026-09-27T11:00:00.000Z"),
      task: { title: "整理访谈记录" },
      inboxItem: null,
    },
  ]);

  assert.equal(history[0].actionLabel, "延期");
  assert.equal(history[0].title, "整理访谈记录");
  assert.equal(history[1].actionLabel, "建议无效");
  assert.equal(history[1].explanation, "上次延期两次，这次降低任务密度");
});

test("推断偏好摘要只在计划密度被自动调低时出现", () => {
  assert.equal(
    inferredPreferenceSummary([
      { key: "plan_scale", value: "few", note: null },
    ]),
    "根据最近的延期、编辑或无效反馈，计划密度已自动调低。",
  );
  assert.equal(
    inferredPreferenceSummary([
      { key: "plan_scale", value: "ambitious", note: null },
    ]),
    "",
  );
});
