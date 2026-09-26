/**
 * v3.5 的统一决策结果。
 *
 * 计划、便利贴、教练建议最后都要收成一张 DecisionCard，
 * 避免每个 AI 功能各自拼一套标题、步骤和下一步。
 */
export type DecisionKind =
  | "recommend"
  | "compare"
  | "plan"
  | "coach"
  | "clarify"
  | "review";

export type DecisionReadiness = "ready" | "needs_context" | "needs_meaning";

export type DecisionSession = {
  stage: "clarify" | "decide" | "execute";
  kind: DecisionKind;
  coreNeedHypothesis: string;
  recommendation: string;
  nextAction: string;
  fallback: string;
  confidence: number;
  explanation: string;
};

export type DecisionCard = {
  kind: DecisionKind;
  title: string;
  recommendation: string;
  why: string[];
  executionSteps: string[];
  fallback: string;
  doneWhen: string;
  nextStep: string;
  confidence: number;
  explanation: string;
};

export type DecisionSourceTask = {
  title: string;
  shortTitle: string;
  recommendation?: string | null;
  executionSteps?: string[] | null;
  fallback?: string | null;
  methodHint: string;
  doneWhen: string;
};

export type DecisionSourceAdvice = {
  title: string;
  encouragement: string;
  steps: string[];
  nextStep: string;
};

export type DecisionStickyPayload = {
  title: string;
  encouragement: string;
  steps: string[];
  nextStep: string;
};

function compact(value: string | null | undefined, max = 400) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function cleanList(value: string[] | null | undefined, max = 8) {
  return (value ?? [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, max);
}

export function routeDecisionKind(input: {
  message?: string | null;
  mode?: "plan" | "coach" | "review";
  readiness?: DecisionReadiness | null;
}): DecisionKind {
  const message = String(input.message ?? "").trim();
  if (input.mode === "review") return "review";
  if (input.readiness && input.readiness !== "ready") return "clarify";
  if (input.mode === "plan") return "plan";
  if (/比较|还是|哪个|区别|差别|选哪个/.test(message)) return "compare";
  if (/推荐|吃什么|买什么|用什么|替代|组合|具体.*(?:方案|食物|商品)/.test(message)) {
    return "recommend";
  }
  if (/计划|安排|步骤|推进|项目|接下来怎么做/.test(message)) return "plan";
  if (/卡|不知道|没头绪|做不下去|不知道怎么开始/.test(message)) {
    return "coach";
  }
  return "coach";
}

export function buildDecisionSession(input: {
  stage?: DecisionSession["stage"];
  kind: DecisionKind;
  coreNeedHypothesis?: string | null;
  recommendation?: string | null;
  nextAction?: string | null;
  fallback?: string | null;
  confidence?: number | null;
  explanation?: string | null;
}): DecisionSession {
  return {
    stage: input.stage ?? (input.nextAction ? "execute" : "decide"),
    kind: input.kind,
    coreNeedHypothesis: compact(input.coreNeedHypothesis, 500),
    recommendation: compact(input.recommendation),
    nextAction: compact(input.nextAction),
    fallback: compact(input.fallback),
    confidence:
      typeof input.confidence === "number"
        ? Math.max(0, Math.min(1, input.confidence))
        : input.recommendation
          ? 0.8
          : 0.5,
    explanation: compact(input.explanation, 300),
  };
}

export function decisionSessionFromReview(input: {
  summary: string;
  nextAction?: string | null;
}): DecisionSession {
  const nextAction = compact(input.nextAction);
  return buildDecisionSession({
    stage: nextAction ? "execute" : "decide",
    kind: "review",
    coreNeedHypothesis: compact(input.summary, 500),
    recommendation: nextAction || compact(input.summary),
    nextAction,
    confidence: nextAction ? 0.78 : 0.6,
  });
}

export function decisionCardFromTask(
  task: DecisionSourceTask,
): DecisionCard {
  const executionSteps = cleanList(task.executionSteps);
  const recommendation =
    compact(task.recommendation) || compact(task.methodHint);
  const fallback = compact(task.fallback);
  const nextStep = executionSteps[0] ?? recommendation;

  return {
    kind: "plan",
    title: compact(task.shortTitle || task.title, 80),
    recommendation,
    why: [compact(task.methodHint)],
    executionSteps,
    fallback,
    doneWhen: compact(task.doneWhen),
    nextStep,
    confidence: recommendation ? 0.82 : 0.45,
    explanation: task.methodHint ? `按这个做法推进：${task.methodHint}` : "",
  };
}

export function decisionCardFromAdvice(
  advice: DecisionSourceAdvice,
  kind: DecisionKind = "coach",
): DecisionCard {
  const steps = cleanList(advice.steps, 4);
  return {
    kind,
    title: compact(advice.title, 80),
    recommendation: compact(advice.encouragement),
    why: [compact(advice.encouragement)],
    executionSteps: steps,
    fallback: "",
    doneWhen: steps.at(-1) ?? compact(advice.nextStep),
    nextStep: compact(advice.nextStep) || steps[0] || compact(advice.encouragement),
    confidence: 0.7,
    explanation: "",
  };
}

export function stickyPayloadFromDecisionCard(
  card: DecisionCard,
): DecisionStickyPayload {
  const steps = [
    ...cleanList(card.executionSteps),
    ...(card.fallback ? [`如果主方案不可行：${card.fallback}`] : []),
  ];
  const nextStep = compact(card.nextStep) || steps[0] || card.recommendation;

  return {
    title: card.title || "执行便利贴",
    encouragement: [
      card.recommendation || card.why[0] || "",
      card.explanation ? `调整依据：${card.explanation}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    steps: steps.length ? steps : [card.recommendation || card.doneWhen],
    nextStep,
  };
}
