import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
  OUTPUT_QUALITY_RULES,
  MODE_JUDGMENT_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  buildClarificationTranslationUserPayload,
  buildPlanUserPayload,
} from "@/lib/ai-prompts";
import {
  CONTENT_GENERATION_SYSTEM_PROMPT,
  NORMAL_COMPOSE_SYSTEM_PROMPT,
  PLAN_CRITIC_SYSTEM_PROMPT,
} from "@/lib/agent-plan/prompts";

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

test("链路第 1 段：翻译 Agent 产出结构化语义和默认判断", () => {
  for (const token of [
    "你把用户信息翻译成",
    "confirmedFacts",
    "interpretations",
    "unknowns",
    "workingAssumption",
    "ifWrongThen",
    "readiness",
    "summary",
    "question",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `翻译 Agent 提示词缺少：${token}`,
    );
  }

  const translationPayload = JSON.parse(
    buildClarificationTranslationUserPayload({
      originalIdea: "想换一个笔记软件",
      history: [],
      inputAssessmentHint: { readiness: "ready" },
    }),
  );
  assert.equal(translationPayload.originalIdea, "想换一个笔记软件");
  assert.deepEqual(translationPayload.history, []);
  assert.deepEqual(translationPayload.inputAssessmentHint, { readiness: "ready" });
});

test("翻译 Agent 默认自己决定，不把选择推回用户", () => {
  for (const token of [
    "不要用问题把选择推回给用户",
    "两个子问题",
    "只有缺少一个只有用户知道的事实/条件",
    "你上级更常看日报",
    "先做作品集还是先写博客",
    "不描述你的理解",
    "回答过你的问题之后",
    "只在最开始",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `翻译 Agent 提问规则缺少：${token}`,
    );
  }
});

test("链路第 2 段：规划执行 Agent 只排一条路，不拆任务", () => {
  for (const token of [
    "规划执行 Agent",
    "只给一条路",
    "不要候选",
    "不要写任务字段",
    "要核实什么",
  ]) {
    assert.ok(
      CONTENT_GENERATION_SYSTEM_PROMPT.includes(token),
      `规划执行 Agent 提示词缺少：${token}`,
    );
  }
});

test("翻译 Agent 只问缺失事实，不问做法或子步骤", () => {
  for (const token of [
    "只有缺少一个只有用户知道的事实/条件",
    "先做 A 还是先做 B",
    "一律不要问",
    "同一个问题下的两个子问题",
    "指代必须准确",
    "options 是事实/条件的可能取值",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `翻译 Agent 缺少提问规则：${token}`,
    );
  }
});

test("链路第 3 段：收敛与排版 Agent 拆任务并决定模式", () => {
  for (const token of [
    "收敛与排版 Agent",
    "longterm",
    "explore",
    "executionMode",
    "recommendation",
    "executionSteps",
    "fallback",
  ]) {
    assert.ok(
      NORMAL_COMPOSE_SYSTEM_PROMPT.includes(token),
      `收敛与排版 Agent 提示词缺少：${token}`,
    );
  }
  assert.ok(NORMAL_COMPOSE_SYSTEM_PROMPT.includes("不设固定 1 条或 2 条"));
  assert.ok(NORMAL_COMPOSE_SYSTEM_PROMPT.includes("首条任务必须直接执行 recommendation"));
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

test("翻译 Agent 遇到配置依赖任务也要补关键事实", () => {
  for (const token of [
    "设备/系统/预算/平台/时间窗口",
    "Windows 还是 Mac",
    "只有缺少一个只有用户知道的事实/条件",
    "一轮只问一个最关键的事实",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `配置依赖提问规则缺少：${token}`,
    );
  }
});

test("任务提示词不要默认依赖备忘录", () => {
  assert.ok(OUTPUT_QUALITY_RULES.includes("不要默认把“记到备忘录"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("不要默认把“记到备忘录"));
  assert.ok(NORMAL_COMPOSE_SYSTEM_PROMPT.includes("不要默认使用备忘录"));
});

test("软件选择默认免费或系统自带方案", () => {
  assert.ok(OUTPUT_QUALITY_RULES.includes("免费或系统自带的可行方案"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("优先免费或系统自带方案"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("不要默认推荐 Wallpaper Engine"));
});

test("计划质检 Agent 拦住准备动作和推回决定", () => {
  for (const token of [
    "第一任务必须改变现实",
    "不能是记录、清点、整理、写清单、做准备",
    "独立结果",
    "不能默认备忘录",
    "不能出现“根据结果决定、先比较、再选择”",
    "反馈闭环",
    "score >= 8 才通过",
  ]) {
    assert.ok(
      PLAN_CRITIC_SYSTEM_PROMPT.includes(token),
      `计划质检规则缺少：${token}`,
    );
  }
});

test("走走默认做事情，answer 模式暂时不启用", () => {
  assert.ok(CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes("默认 action"));
  assert.ok(CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes("暂时保留字段，但不要选"));
  assert.ok(CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes("走走是用来做事的"));
});

test("开放能力的第一件作品仍然是 explore", () => {
  assert.ok(MODE_JUDGMENT_SYSTEM_PROMPT.includes("第一轮练习"));
  assert.ok(MODE_JUDGMENT_SYSTEM_PROMPT.includes("想学手工"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("第一件小作品只是这一轮"));
  assert.ok(NORMAL_COMPOSE_SYSTEM_PROMPT.includes("不能做完一件就结束"));
});
