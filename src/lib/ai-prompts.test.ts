import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTPUT_QUALITY_RULES,
  PLAN_SYSTEM_PROMPT,
  buildPlanUserPayload,
} from "@/lib/ai-prompts";

/**
 * 这些断言存在的意义：提示词是产品的核心资产，但不能被静默删改。
 * 尤其是「执行合同」和「反模板句」两段，删掉了没人会发现，只有线上输出变糊。
 */
test("计划提示词写清了执行合同的取值约束", () => {
  for (const token of [
    "quick",
    "tool",
    "produce",
    "explore",
    "project",
    "maxTurns",
    "toolPolicy",
    "confirm-write",
    "doneWhen",
    "shortTitle",
  ]) {
    assert.ok(
      PLAN_SYSTEM_PROMPT.includes(token),
      `计划提示词里缺少执行合同关键词：${token}`,
    );
  }
});

test("计划提示词要求只返回 JSON", () => {
  assert.ok(PLAN_SYSTEM_PROMPT.includes("只返回 JSON"));
});

test("计划提示词要求首条任务当天或明天能开始", () => {
  assert.ok(PLAN_SYSTEM_PROMPT.includes("当天或明天"));
});

test("全局质量约束保留了反模板句规定", () => {
  assert.ok(OUTPUT_QUALITY_RULES.includes("不要每轮都先肯定用户"));
  assert.ok(OUTPUT_QUALITY_RULES.includes("最小一步"));
  assert.ok(OUTPUT_QUALITY_RULES.includes("像人说话"));
});

test("user 消息带齐字段并为可选值填默认", () => {
  const payload = JSON.parse(
    buildPlanUserPayload({
      currentDate: "2026-09-17",
      content: "想整理访谈记录",
      projectNames: ["访谈整理"],
      projects: [],
    }),
  );

  assert.equal(payload.currentDate, "2026-09-17");
  assert.equal(payload.content, "想整理访谈记录");
  assert.deepEqual(payload.projectNames, ["访谈整理"]);
  assert.equal(payload.memorySummary, null);
  assert.deepEqual(payload.dimensionChoices, []);
  assert.deepEqual(payload.contextEvidence, []);
  assert.equal(payload.maxTasks, null);
});

test("user 消息保留显式传入的可选字段", () => {
  const payload = JSON.parse(
    buildPlanUserPayload({
      currentDate: "2026-09-17",
      content: "x",
      projectNames: [],
      projects: [{ name: "P" }],
      memorySummary: "用户偏好两件任务",
      dimensionChoices: ["先看反馈"],
      contextEvidence: ["项目 P 已 5 天没推进"],
      maxTasks: 2,
    }),
  );

  assert.equal(payload.memorySummary, "用户偏好两件任务");
  assert.deepEqual(payload.dimensionChoices, ["先看反馈"]);
  assert.deepEqual(payload.contextEvidence, ["项目 P 已 5 天没推进"]);
  assert.equal(payload.maxTasks, 2);
});
