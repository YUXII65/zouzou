import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTPUT_QUALITY_RULES,
  PLAN_SYSTEM_PROMPT,
  SOCRATIC_CLARIFY_SYSTEM_PROMPT,
  buildPlanUserPayload,
  buildSocraticClarifyUserPayload,
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
    "methodHint",
    "recommendation",
    "executionSteps",
    "fallback",
    "shortTitle",
  ]) {
    assert.ok(
      PLAN_SYSTEM_PROMPT.includes(token),
      `计划提示词里缺少执行合同关键词：${token}`,
    );
  }
});

test("计划提示词限制任务粒度并禁止无限拆分", () => {
  assert.ok(PLAN_SYSTEM_PROMPT.includes("不设固定 1 条或 2 条"));
  assert.ok(PLAN_SYSTEM_PROMPT.includes("内部顺序步骤写在 notes"));
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
      clarificationFrame: { coreNeedHypothesis: "先验证需求" },
      clarificationSession: { recommendation: "先做三个访谈" },
      decisionMemory: ["延期：整理访谈记录；下次缩小范围"],
      maxTasks: 2,
    }),
  );

  assert.equal(payload.memorySummary, "用户偏好两件任务");
  assert.deepEqual(payload.dimensionChoices, ["先看反馈"]);
  assert.deepEqual(payload.contextEvidence, ["项目 P 已 5 天没推进"]);
  assert.deepEqual(payload.clarificationFrame, { coreNeedHypothesis: "先验证需求" });
  assert.deepEqual(payload.clarificationSession, { recommendation: "先做三个访谈" });
  assert.deepEqual(payload.decisionMemory, [
    "延期：整理访谈记录；下次缩小范围",
  ]);
  assert.equal(payload.maxTasks, 2);
});

test("苏格拉底澄清提示词一次只问一个并允许提前停止", () => {
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("每次只能问一个问题"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("不能提前给出一整套问卷"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("信息已经足够"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("reflection"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("coreNeedHypothesis"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("decisiveUnknown"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("workingAssumption"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("会改变计划"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("最多 6 个"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("inputAssessmentHint"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("completionPrompt"));
  assert.ok(SOCRATIC_CLARIFY_SYSTEM_PROMPT.includes("needs_meaning"));
});

test("澄清 user 消息带上项目上下文和上一轮推进判断", () => {
  const payload = JSON.parse(
    buildSocraticClarifyUserPayload({
      originalIdea: "想做个人网站",
      contextSummary: "之前做过 landing page",
      contextEvidence: ["用户有一个待办项目"],
      projectContext: [{ name: "个人网站" }],
      decisionMemory: ["已完成：整理作品素材"],
      previousFrame: { coreNeedHypothesis: "先服务招聘方" },
      inputAssessmentHint: { readiness: "needs_context", missingSlots: ["具体对象"] },
      history: [
        {
          key: "goal",
          question: "第一版最需要服务谁？",
          answers: ["招聘方"],
          reflection: null,
        },
      ],
      askedCount: 1,
      maxQuestions: 2,
    }),
  );

  assert.equal(payload.originalIdea, "想做个人网站");
  assert.deepEqual(payload.projectContext, [{ name: "个人网站" }]);
  assert.deepEqual(payload.decisionMemory, ["已完成：整理作品素材"]);
  assert.deepEqual(payload.previousFrame, { coreNeedHypothesis: "先服务招聘方" });
  assert.deepEqual(payload.inputAssessmentHint, {
    readiness: "needs_context",
    missingSlots: ["具体对象"],
  });
  assert.equal(payload.history[0].question, "第一版最需要服务谁？");
});

test("计划 user 消息保留结构化澄清历史", () => {
  const payload = JSON.parse(
    buildPlanUserPayload({
      currentDate: "2026-09-25",
      content: "想把访谈整理成方向",
      projectNames: [],
      projects: [],
      clarificationHistory: [
        {
          key: "constraint",
          question: "这次最不想牺牲什么？",
          answers: ["先拿到真实反馈"],
          reflection: null,
        },
      ],
      clarificationSummary: { realProblem: "先验证需求" },
    }),
  );

  assert.deepEqual(payload.clarificationHistory, [
    {
      key: "constraint",
      question: "这次最不想牺牲什么？",
      answers: ["先拿到真实反馈"],
      reflection: null,
    },
  ]);
  assert.deepEqual(payload.clarificationSummary, { realProblem: "先验证需求" });
});
