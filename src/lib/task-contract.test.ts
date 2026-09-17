import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskContract, taskModeLabel } from "@/lib/task-contract";

/**
 * 这一组盯的是「任务尺度」契约：小任务不能被工程化，长期目标不能一轮结束。
 * 规则来源：AGENTS.md「任务尺度与输出质量」—— quick=1、tool/produce=2、explore/project=3。
 */
const MAX_TURNS_BY_MODE: Record<string, number> = {
  quick: 1,
  tool: 2,
  produce: 2,
  explore: 3,
  project: 3,
};

/** 空泛说法黑名单，禁止出现在完成标准里 */
const VAGUE_PHRASES = ["初版", "最小一步", "先确认方向", "核心方向", "现实限制"];

const SAMPLES: Array<[string, string]> = [
  ["解释一下什么是复利", "quick"],
  ["查一下明天的高铁票还有没有", "tool"],
  ["整理这周的会议记录", "produce"],
  ["验证一下这个方向值不值得", "explore"],
  ["长期做一个自媒体账号", "project"],
];

for (const [input, expectedMode] of SAMPLES) {
  test(`执行方式：${input} → ${expectedMode}`, () => {
    const contract = buildTaskContract(input);
    assert.equal(
      contract.executionMode,
      expectedMode,
      `"${input}" 期望 ${expectedMode}，实际 ${contract.executionMode}`,
    );
    assert.equal(contract.maxTurns, MAX_TURNS_BY_MODE[contract.executionMode]);
  });
}

test("所有样本的轮次与工具策略都在允许范围内", () => {
  for (const [input] of SAMPLES) {
    const contract = buildTaskContract(input);
    assert.ok(
      Object.keys(MAX_TURNS_BY_MODE).includes(contract.executionMode),
      `${input} 的 executionMode 越界：${contract.executionMode}`,
    );
    assert.ok(
      ["none", "read", "confirm-write"].includes(contract.toolPolicy),
      `${input} 的 toolPolicy 越界：${contract.toolPolicy}`,
    );
    assert.ok(contract.doneWhen.trim().length > 0);
  }
});

test("完成标准里不出现空泛说法", () => {
  for (const [input] of SAMPLES) {
    const { doneWhen } = buildTaskContract(input);
    for (const phrase of VAGUE_PHRASES) {
      assert.ok(
        !doneWhen.includes(phrase),
        `"${input}" 的完成标准出现空泛说法「${phrase}」：${doneWhen}`,
      );
    }
  }
});

test("完成标准引用了任务里的具体对象，而不是套用同一句话", () => {
  const a = buildTaskContract("整理这周的会议记录").doneWhen;
  const b = buildTaskContract("整理上周的用户访谈记录").doneWhen;
  assert.notEqual(a, b);
  assert.ok(a.includes("会议"));
  assert.ok(b.includes("访谈"));
});

test("写操作的任务走到 confirm-write，不会被当成可以直接做", () => {
  assert.equal(buildTaskContract("发布这篇文章").toolPolicy, "confirm-write");
});

test("执行方式有中文标签", () => {
  assert.equal(taskModeLabel("quick"), "直接完成");
  assert.equal(taskModeLabel("tool"), "查资料");
  assert.equal(taskModeLabel("project"), "长期推进");
  assert.equal(taskModeLabel(null), "直接完成");
});
