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
  PLAN_AGENT_SYSTEM_PROMPT,
  PLAN_CRITIC_SYSTEM_PROMPT,
} from "@/lib/agent-plan/prompts";
import { BANNED_OUTPUT_PHRASES } from "@/lib/ai-quality";

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

test("全局质量约束保留关键约束维度", () => {
  // 只校验约束维度存在，不锁死具体短语：
  // 短语会随迭代被替换或收敛成规则，锁死它们等于禁止提示词收敛。
  assert.ok(
    /先肯定用户|总结、共情或流程声明/.test(OUTPUT_QUALITY_RULES),
    "缺少反客套开场约束",
  );
  assert.ok(
    /可检查的结果|无法验证|可验证的产出/.test(OUTPUT_QUALITY_RULES),
    "缺少产出可验证约束",
  );
  assert.ok(OUTPUT_QUALITY_RULES.includes("像人说话"), "缺少自然语气约束");
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
    "翻译 Agent",
    "confirmedFacts",
    "interpretations",
    "unknowns",
    "desiredOutcome",
    "workingAssumption",
    "ifWrongThen",
    "readiness",
    "inputAssessmentNote",
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

test("翻译 Agent 首轮必须保留一次提问", () => {
  for (const token of [
    "history 为空",
    "forceQuestion 为 true",
    "question 不许为 null，必须给一个只有用户知道的事实/条件题",
    "涉及他个人时间、能力、关系、感情、情绪、健康、习惯、钱、风险或现实代价的事",
    "低风险小任务也至少完成两轮提问",
    "history 已有回答且 forceQuestion 不为 true",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `翻译 Agent 首轮提问规则缺少：${token}`,
    );
  }
});

test("翻译 Agent 默认自己决定，不把选择推回用户", () => {
  for (const token of [
    "默认自己判断，不把选择推回用户",
    "做法、顺序、工具、先做哪块是你的活",
    "只能问“只有用户知道的事实”",
    "设备、预算、时间窗口",
    "不描述你的理解",
    "forceQuestion 为 true 时",
    "不能重复问过的问题",
    "没有新的关键未知点会改变第一条任务或完成标准",
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
    "做法、顺序、工具、先做哪块是你的活",
    "一次只问一个",
    "history 里问过的不再问",
    "指代要准确",
    "options 是该事实的 2-3 个可能取值",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `翻译 Agent 缺少提问规则：${token}`,
    );
  }
});

test("链路第 2 段：方案 Agent 直接输出行动卡和任务", () => {
  for (const token of [
    "方案 Agent",
    "longterm",
    "explore",
    "executionMode",
    "recommendation",
    "executionSteps",
    "fallback",
  ]) {
    assert.ok(
      PLAN_AGENT_SYSTEM_PROMPT.includes(token),
      `方案 Agent 提示词缺少：${token}`,
    );
  }
  assert.ok(PLAN_AGENT_SYSTEM_PROMPT.includes("不超过 maxTasks"));
  assert.ok(PLAN_AGENT_SYSTEM_PROMPT.includes("只给一条路"));
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

test("翻译 Agent 不再有直接回答出口", () => {
  for (const token of [
    "没有“直接回答”这个出口",
    "把它落到一个能验收的动作或计划上",
    "涉及他个人时间、能力、关系、感情、情绪、健康、习惯、钱、风险或现实代价的事",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `翻译 Agent 缺少去 answer 约束：${token}`,
    );
  }
});

test("翻译 Agent 遇到配置依赖任务也要补关键事实", () => {
  for (const token of [
    "设备、预算、时间窗口、对方的真实偏好",
    "只能问“只有用户知道的事实”",
    "一次只问一个",
    "做法、顺序、工具、先做哪块是你的活",
  ]) {
    assert.ok(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes(token),
      `配置依赖提问规则缺少：${token}`,
    );
  }
});

test("提示词不再点名记录工具，改为约束载体和信息差", () => {
  for (const prompt of [
    OUTPUT_QUALITY_RULES,
    CONTENT_GENERATION_SYSTEM_PROMPT,
    PLAN_AGENT_SYSTEM_PROMPT,
  ]) {
    assert.ok(!prompt.includes("备忘录"), "提示词不该再点名备忘录");
  }
  assert.ok(OUTPUT_QUALITY_RULES.includes("载体必须是这件事真正发生的地方"));
  assert.ok(OUTPUT_QUALITY_RULES.includes("抹平信息差"));
  assert.ok(PLAN_AGENT_SYSTEM_PROMPT.includes("记录、复盘、打卡、日报不是默认动作"));
});

test("软件选择默认免费或系统自带方案", () => {
  assert.ok(OUTPUT_QUALITY_RULES.includes("免费或系统自带的可行方案"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("优先免费或系统自带方案"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("不要默认推荐 Wallpaper Engine"));
});

test("计划质检 Agent 拦住准备动作和推回决定", () => {
  // 只校验约束维度，不锁死具体措辞：
  // 措辞会随迭代被替换或收敛成规则，锁死它们等于禁止提示词收敛。
  const p = PLAN_CRITIC_SYSTEM_PROMPT;
  assert.ok(/改变现实|产生变化/.test(p), "缺少『第一任务必须改变现实』约束");
  assert.ok(/准备|记录/.test(p), "缺少『准备类动作不算任务』约束");
  assert.ok(p.includes("独立结果"), "缺少独立结果约束");
  assert.ok(p.includes("载体"), "缺少载体约束");
  assert.ok(/推回给用户|把选择推回/.test(p), "缺少『默认决定』约束");
  assert.ok(p.includes("反馈闭环"), "缺少反馈闭环约束");
  assert.ok(p.includes("score >= 8"), "缺少质检通过门槛");
});

test("翻译 Agent 的 responseMode 只剩 action / plan", () => {
  assert.ok(
    CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes('"responseMode":"action|plan"'),
  );
  assert.ok(!CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes("answer：他要的就是"));
  assert.ok(
    CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes("没有“直接回答”这个出口"),
  );
  assert.ok(CLARIFICATION_TRANSLATION_SYSTEM_PROMPT.includes("推进成现实里的一件事"));
});

test("开放能力的第一件作品仍然是 explore", () => {
  assert.ok(MODE_JUDGMENT_SYSTEM_PROMPT.includes("第一轮练习"));
  assert.ok(MODE_JUDGMENT_SYSTEM_PROMPT.includes("想学手工"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("第一件小作品只是这一轮"));
  assert.ok(PLAN_AGENT_SYSTEM_PROMPT.includes("第一件作品只是这一轮的练习"));
  assert.ok(PLAN_AGENT_SYSTEM_PROMPT.includes("下一轮怎么接着练"));
});

test("提示词里不再逐条列举具体反例", () => {
  // 反例清单只保留在 src/lib/ai-quality.ts 一处（机器质检用）。
  // 提示词里重新长出枚举，就会再次变成「加一条反例要改多处」。
  const prompts: Array<[string, string]> = [
    ["OUTPUT_QUALITY_RULES", OUTPUT_QUALITY_RULES],
    ["PLAN_SYSTEM_PROMPT", PLAN_SYSTEM_PROMPT],
    ["CLARIFICATION_TRANSLATION_SYSTEM_PROMPT", CLARIFICATION_TRANSLATION_SYSTEM_PROMPT],
    ["PLAN_AGENT_SYSTEM_PROMPT", PLAN_AGENT_SYSTEM_PROMPT],
  ];
  for (const [name, text] of prompts) {
    for (const line of text.split("\n")) {
      const hits = BANNED_OUTPUT_PHRASES.filter((phrase) => line.includes(phrase));
      assert.ok(
        hits.length < 2,
        `${name} 里又在一行内成组列举具体反例：${hits.join("、")}`,
      );
    }
  }
});
