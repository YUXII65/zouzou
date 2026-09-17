import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPlanQuality, compareAgainstBaseline } from "@/lib/ai-quality";

type Task = Record<string, unknown>;

function task(overrides: Task = {}): Task {
  return {
    title: "整理上周的用户访谈记录并标出三个反复出现的抱怨",
    shortTitle: "整理访谈抱怨",
    executionMode: "produce",
    doneWhen: "产出一份标好三处抱怨的访谈摘要",
    maxTurns: 2,
    toolPolicy: "none",
    notes: null,
    ...overrides,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    action: "single_task",
    projectName: null,
    projectObjective: "把访谈里的抱怨整理成可以改进的方向",
    projectMilestone: null,
    tasks: [task()],
    reason: "你已经收集了三份访谈，先整理出来才看得出重复的问题",
    ...overrides,
  };
}

test("合格的计划不报问题", () => {
  assert.deepEqual(checkPlanQuality(plan(), { maxTasks: 3 }), []);
});

test("不是对象直接判定无效", () => {
  assert.deepEqual(checkPlanQuality(null), ["计划不是有效的 JSON 对象"]);
  assert.deepEqual(checkPlanQuality("文本"), ["计划不是有效的 JSON 对象"]);
});

test("没有任务时只报这一条并提前结束", () => {
  const issues = checkPlanQuality(plan({ tasks: [] }));
  assert.equal(issues.length, 1);
  assert.match(issues[0], /至少要有一条任务/);
});

test("缺少 reason 会被抓出来", () => {
  const issues = checkPlanQuality(plan({ reason: "" }));
  assert.ok(issues.some((issue) => issue.includes("缺少 reason")));
});

test("任务数超过上限会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task(), task({ title: "第二条任务" }), task({ title: "第三条任务" })] }),
    { maxTasks: 2 },
  );
  assert.ok(issues.some((issue) => issue.includes("超过上限")));
});

test("maxTurns 与 executionMode 不一致会被抓出来", () => {
  const issues = checkPlanQuality(plan({ tasks: [task({ executionMode: "quick", maxTurns: 3 })] }));
  assert.ok(issues.some((issue) => issue.includes("不一致")));
});

test("executionMode 与 toolPolicy 取值非法会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task({ executionMode: "随便", toolPolicy: "随便写" })] }),
  );
  assert.ok(issues.some((issue) => issue.includes("executionMode 非法")));
  assert.ok(issues.some((issue) => issue.includes("toolPolicy 非法")));
});

test("缺少 doneWhen 会被抓出来", () => {
  const issues = checkPlanQuality(plan({ tasks: [task({ doneWhen: "" })] }));
  assert.ok(issues.some((issue) => issue.includes("缺少 doneWhen")));
});

test("shortTitle 直接截断标题会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({
      tasks: [task({ title: "整理上周的用户访谈记录", shortTitle: "整理上周的用" })],
    }),
  );
  assert.ok(issues.some((issue) => issue.includes("截断")));
});

test("shortTitle 与标题完全相同会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task({ title: "整理访谈", shortTitle: "整理访谈" })] }),
  );
  assert.ok(issues.some((issue) => issue.includes("完全相同")));
});

test("空泛说法会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ projectObjective: "先做一个初版", projectMilestone: "先确认方向" }),
  );
  assert.ok(issues.some((issue) => issue.includes("空泛说法")));
});

test("模板句会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ reason: "我大概知道你真正看重什么了，所以先这样安排" }),
  );
  assert.ok(issues.some((issue) => issue.includes("模板句")));
});

test("tasks 里混入非对象元素不会让它崩", () => {
  const issues = checkPlanQuality(plan({ tasks: [null, 42, task()] }));
  assert.deepEqual(issues, []);
});

test("回归门禁：基线通过、这次失败才算回归", () => {
  const result = compareAgainstBaseline(
    [
      { id: "a", pass: true, failures: [], taskCount: 3 },
      { id: "b", pass: false, failures: ["任务数超限"], taskCount: 6 },
      { id: "c", pass: true, failures: [], taskCount: 2 },
    ],
    [
      { id: "a", pass: false, failures: ["出现模板句"], taskCount: 3 },
      { id: "b", pass: true, failures: [], taskCount: 3 },
      { id: "c", pass: true, failures: [], taskCount: 4 },
    ],
  );

  assert.deepEqual(result.newFailures, [
    { id: "a", before: [], after: ["出现模板句"] },
  ]);
  assert.deepEqual(result.fixed, ["b"]);
  assert.deepEqual(result.taskCountChanged, [{ id: "c", before: 2, after: 4 }]);
  assert.deepEqual(result.added, []);
});

test("回归门禁：新增用例不算回归", () => {
  const result = compareAgainstBaseline(
    [{ id: "a", pass: true }],
    [{ id: "a", pass: true }, { id: "brand-new", pass: false, failures: ["x"] }],
  );
  assert.deepEqual(result.newFailures, []);
  assert.deepEqual(result.added, ["brand-new"]);
});

test("回归门禁：一直失败的用例不算新增回归", () => {
  const result = compareAgainstBaseline(
    [{ id: "a", pass: false, failures: ["旧问题"] }],
    [{ id: "a", pass: false, failures: ["旧问题"] }],
  );
  assert.deepEqual(result.newFailures, []);
  assert.deepEqual(result.fixed, []);
});
