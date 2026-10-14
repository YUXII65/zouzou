/**
 * 生产三段 Agent 链的评测版实现：翻译 -> 生成内容 -> 收敛。
 *
 * evaluate-ai.mjs 和 evaluate-first-run.mjs 共用这一份，
 * 避免两边各自复制一段近似流程后又和生产悄悄分叉。
 */
import { extractJsonObject as extractJson } from "../../src/lib/json-extract.ts";
import { checkPlanQuality } from "../../src/lib/ai-quality.ts";
import {
  CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
  MODE_JUDGMENT_SYSTEM_PROMPT,
  buildClarificationTranslationUserPayload,
  buildModeJudgmentUserPayload,
} from "../../src/lib/ai-prompts.ts";
import {
  CONTENT_GENERATION_SYSTEM_PROMPT,
  NORMAL_COMPOSE_SYSTEM_PROMPT,
} from "../../src/lib/agent-plan/prompts.ts";

export const CHAIN_PROMPTS = [
  CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
  CONTENT_GENERATION_SYSTEM_PROMPT,
  NORMAL_COMPOSE_SYSTEM_PROMPT,
].join("\n\n----\n\n");

/** 和生产 readComposedPlan 一致：模型漏字段时补上项目名/目标/里程碑。 */
function projectNameFromGoal(goal) {
  const firstClause = String(goal ?? "").split(/[，,。；;：:！？!?]/)[0]?.trim() || "";
  return (
    firstClause
      .replace(/^(?:先|请|帮我|需要|想要?|完成|做出|上线)\s*/u, "")
      .trim()
      .slice(0, 24) || "普通事项"
  );
}

function withProjectFallbacks(plan, translation) {
  if (!plan || typeof plan !== "object") return plan;
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const derivedName = projectNameFromGoal(
    translation?.normalizedIntent || translation?.literalMeaning,
  );
  const projectName = plan.projectName || derivedName;
  const projectObjective = plan.projectObjective || projectName;
  const projectMilestone =
    plan.projectMilestone || tasks[0]?.doneWhen || projectObjective;
  return { ...plan, projectName, projectObjective, projectMilestone };
}

function briefFromTranslation(translation, originalIdea) {
  const goal =
    translation.normalizedIntent ||
    translation.goals?.[0] ||
    translation.literalMeaning ||
    originalIdea;
  return {
    goal,
    confirmedFacts: (translation.confirmedFacts ?? []).slice(0, 8),
    constraints: (translation.constraints ?? []).slice(0, 6),
    successSignal:
      translation.goals?.[0] ||
      translation.normalizedIntent ||
      translation.literalMeaning ||
      goal,
    assumptions: (translation.interpretations ?? []).slice(0, 4),
    ifWrongThen: "",
  };
}

export function createChainRunner({ baseUrl, apiKey, model, debug = false }) {
  async function requestChat(system, userContent, maxTokens, temperature = 0.2) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(/deepseek/i.test(model) || /deepseek/i.test(baseUrl)
          ? { reasoning_effort: "none" }
          : {}),
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`AI 请求失败：${response.status}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content && debug) {
      console.log("EMPTY RESPONSE:", JSON.stringify(data).slice(0, 1200));
    }
    return content;
  }

  /** 跑生产同款三段链，返回收敛出的计划与中间产物。 */
  async function runChain(input, options = {}) {
    const {
      maxTasks = 3,
      projects = [],
      memorySummary = null,
      evidence = [],
      decisionMemory = [],
    } = options;
    const currentDate = new Date().toLocaleDateString("sv-SE");

    const translationRaw = await requestChat(
      CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
      buildClarificationTranslationUserPayload({
        originalIdea: input,
        contextSummary: memorySummary,
        contextEvidence: evidence,
        projectContext: projects,
        previousTranslation: null,
        inputAssessmentHint: null,
        history: [],
      }),
      1400,
      0.1,
    );
    const translationParsed = JSON.parse(extractJson(translationRaw) ?? "{}");
    const translation = translationParsed.translation ?? translationParsed ?? {};
    const summary = translationParsed.summary ?? null;
    const brief = briefFromTranslation(translation, input);

    // 生产在"澄清收口 → 生成之前"先定模式；评测也走这一步，别两边分叉。
    const modeRaw = await requestChat(
      MODE_JUDGMENT_SYSTEM_PROMPT,
      buildModeJudgmentUserPayload([
        {
          id: "current",
          input,
          ...(translation.normalizedIntent
            ? { clarified: String(translation.normalizedIntent) }
            : {}),
        },
      ]),
      700,
      0.1,
    );
    const modeParsed = JSON.parse(extractJson(modeRaw) ?? "[]");
    const workMode =
      Array.isArray(modeParsed) && ["normal", "longterm", "explore"].includes(modeParsed[0]?.mode)
        ? modeParsed[0].mode
        : "normal";

    const contentRaw = await requestChat(
      CONTENT_GENERATION_SYSTEM_PROMPT,
      JSON.stringify({
        originalIdea: input,
        translation,
        clarificationHistory: [],
        clarificationSummary: summary,
        clarificationFrame: null,
        projectContext: projects,
        memorySummary,
        contextEvidence: evidence,
        decisionMemory,
        currentDate,
      }),
      2200,
      0.55,
    );
    const contentParsed = JSON.parse(extractJson(contentRaw) ?? "{}");
    const agentPlan = contentParsed.plan ?? null;

    const composePayload = {
      brief,
      plan: agentPlan,
      workMode,
      originalIdea: input,
      projectContext: projects,
      decisionMemory,
      currentDate,
      maxTasks,
    };
    let composeRaw = await requestChat(
      NORMAL_COMPOSE_SYSTEM_PROMPT,
      JSON.stringify(composePayload),
      2600,
      0.2,
    );
    let plan = JSON.parse(extractJson(composeRaw) ?? "{}");
    const auditIssues = checkPlanQuality(plan, { maxTasks });
    if (auditIssues.length) {
      composeRaw = await requestChat(
        NORMAL_COMPOSE_SYSTEM_PROMPT,
        JSON.stringify({ ...composePayload, previousAuditIssues: auditIssues }),
        2600,
        0.15,
      );
      const retryPlan = JSON.parse(extractJson(composeRaw) ?? "{}");
      if (retryPlan && typeof retryPlan === "object") plan = retryPlan;
    }
    return {
      plan: withProjectFallbacks(plan, translation),
      rawPlan: plan,
      translation,
      summary,
      agentPlan,
      workMode,
      composeRaw,
    };
  }

  return { runChain };
}
