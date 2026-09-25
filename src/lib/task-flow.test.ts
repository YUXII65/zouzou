import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendTaskContinuation,
  collapsePlannedTasks,
  formatReviewNextActions,
  parseReviewNextActions,
  reviewNextActionsEqual,
  shouldSyncReviewActions,
} from "@/lib/task-flow";

test("超过安全上限的任务内容合并进备注，不静默丢失", () => {
  const tasks = collapsePlannedTasks(
    [
      { title: "写作品集主题", notes: "先定 20 个字以内", doneWhen: "写出来" },
      { title: "筛选 12 张照片", notes: "统一色调", doneWhen: "选完" },
      { title: "写选择理由", notes: null, doneWhen: "写完" },
    ],
    1,
  );

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "写作品集主题");
  assert.match(tasks[0].notes ?? "", /筛选 12 张照片/);
  assert.match(tasks[0].notes ?? "", /写选择理由/);
});

test("新建项目可以保留少量独立任务", () => {
  const tasks = collapsePlannedTasks(
    [
      { title: "A", notes: null },
      { title: "B", notes: null },
    ],
    2,
  );

  assert.equal(tasks.length, 2);
});

test("复盘的下一步最多只解析一条", () => {
  const actions = parseReviewNextActions(
    ["写开头", "先写三个不同开头并选一个继续", "整理照片", "筛选十二张照片"].join("\n"),
  );

  assert.deepEqual(actions, [
    { shortTitle: "写开头", title: "先写三个不同开头并选一个继续" },
  ]);
});

test("复盘下一步文本相同就视为同一批，不重复生成任务", () => {
  const existing = "写开头\n先写三个不同开头并选一个继续";
  const same = " 写开头 \n先写三个不同开头并选一个继续 ";
  const changed = "写开头\n先写三个不同开头，中午前发出来";

  assert.equal(reviewNextActionsEqual(existing, same), true);
  assert.equal(reviewNextActionsEqual(existing, changed), false);
});

test("草稿首次保存同步，正式复盘同文案重存不同步", () => {
  assert.equal(shouldSyncReviewActions("draft", "旧内容", "旧内容"), true);
  assert.equal(shouldSyncReviewActions("final", "同样的下一步", "同样的下一步"), false);
  assert.equal(shouldSyncReviewActions("final", "原来的下一步", "新的下一步"), true);
});
test("复盘下一步统一格式化为两行结构", () => {
  assert.equal(
    formatReviewNextActions([
      { shortTitle: "写开头", title: "先写三个不同开头并选一个继续" },
    ]),
    "写开头\n先写三个不同开头并选一个继续",
  );
});test("补充内容接到已有任务且重复调用不会重复", () => {
  const first = appendTaskContinuation("原备注", "筛选照片", "只保留十二张");
  const second = appendTaskContinuation(first, "筛选照片", "只保留十二张");

  assert.match(second ?? "", /原备注/);
  assert.match(second ?? "", /筛选照片/);
  assert.equal(second, first);
});
