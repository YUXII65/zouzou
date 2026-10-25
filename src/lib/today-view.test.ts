import { test } from "node:test";
import assert from "node:assert/strict";
import { withLegacyTodayFields, type TodayView } from "@/lib/today-view";

/**
 * 过渡兼容层：线上旧小程序包读的是 pendingItems / tasks / completedToday 等旧字段名。
 * 这条测试锁住"旧字段齐全 + 新字段仍在"，防止将来顺手删掉兼容层时把线上旧包打空。
 */
const view: TodayView = {
  date: "2026-10-16",
  pendingInbox: [
    { id: "i1", content: "一个想法", aiPlanJson: null, aiSuggestionJson: null },
  ],
  plannedTasks: [
    {
      id: "t1",
      title: "一个任务",
      shortTitle: "任务",
      notes: null,
      status: "todo",
      priority: "medium",
      dueDate: new Date("2026-10-20T00:00:00.000Z"),
      scheduledDate: null,
      focusDate: null,
      completedAt: null,
      projectName: "一个项目",
      doneWhen: "完成标准",
      methodHint: "做法",
      executionMode: "quick",
      stickyNotes: [
        {
          id: "s1",
          taskId: "t1",
          sourceMessage: "",
          title: "便利贴",
          encouragement: "鼓励",
          steps: ["第一步"],
          nextStep: "现在做",
          createdAt: "2026-10-16T00:00:00.000Z",
        },
      ],
      isFocused: false,
      isOverdue: false,
      isScheduled: false,
      reason: null,
    },
  ],
  completedTodayTasks: [],
  stats: {
    openTasks: 1,
    completedToday: 0,
    totalToday: 1,
    weekDone: 0,
    streak: 0,
    reviewCount: 0,
  },
  firstRun: { tourStep: "done", isFirstRun: false },
  focusSuggestions: null,
  checkin: null,
};

test("过渡兼容层：旧包字段齐全，新字段保留", () => {
  const payload = withLegacyTodayFields(view);

  assert.equal(payload.pendingItems.length, 1);
  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.completedToday, 0);
  assert.equal(payload.totalToday, 1);
  assert.equal(payload.openTasks, 1);
  assert.equal(payload.streak, 0);
  assert.equal(payload.weekDone, 0);

  const task = payload.tasks[0];
  assert.equal(task.projectName, "一个项目");
  assert.ok(task.dueDateText.length > 0, "旧包需要 dueDateText");
  assert.equal(task.sticky?.title, "便利贴", "旧包需要 sticky");
  assert.deepEqual(task.sticky?.steps, ["第一步"]);
  assert.equal(task.isFocused, false);
  assert.equal(task.isScheduled, false);

  assert.equal(payload.pendingInbox.length, 1, "新字段不能被覆盖掉");
  assert.equal(payload.plannedTasks.length, 1);
  assert.equal(payload.stats.totalToday, 1);
});
