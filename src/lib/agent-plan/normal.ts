import {
  callModel,
  judgeWorkMode,
  safePlanTask,
  translateIdea,
  type InboxClarificationTranslation,
  type InboxClarificationSummary,
  type InboxPlan,
  type InboxPlanContentTrace,
  type InboxPlanTrack,
} from "@/lib/ai";
import {
  MAX_CHAIN_TASKS,
  auditNormalAgentPlan,
  parseObject,
  readPlan,
  readList,
  readText,
  normalizeProjectName,
  readUserCard,
  type NormalAgentBrief,
  type NormalAgentInput,
  type NormalAgentOutcome,
  type NormalAgentPlan,
} from "@/lib/agent-plan/core";
import {
  NORMAL_COMPOSE_SYSTEM_PROMPT_V1,
  NORMAL_STRATEGY_SYSTEM_PROMPT,
  buildPlanAgentSystemPrompt,
  PLAN_CRITIC_SYSTEM_PROMPT,
} from "@/lib/agent-plan/prompts";
import { runContentAgent } from "@/lib/agent-plan/content";
import { buildDecisionSession } from "@/lib/decision";
import { readPlanTracks } from "@/lib/project-track";
import { toDateInputValue } from "@/lib/date";
import { type ProjectMode } from "@/lib/work-mode";
import {
  attachWebEvidenceSources,
  collectPlanWebEvidence,
  webEvidenceForModel,
  webEvidenceSources,
} from "@/lib/web-search";

export {
  auditNormalAgentPlan,
  createAgentFailedPlan,
  type NormalAgentPlan,
  type NormalAgentBrief,
  type NormalAgentInput,
  type NormalAgentOutcome,
} from "@/lib/agent-plan/core";

function buildBriefFromTranslation(
  content: string,
  translation: InboxClarificationTranslation,
): NormalAgentBrief {
  const goal =
    translation.normalizedIntent ||
    translation.goals[0] ||
    translation.literalMeaning ||
    content;
  const successSignal =
    translation.goals[0] ||
    translation.normalizedIntent ||
    translation.literalMeaning ||
    goal;
  return {
    goal,
    confirmedFacts: translation.confirmedFacts.slice(0, 8),
    constraints: translation.constraints.slice(0, 6),
    successSignal,
    assumptions: translation.interpretations.slice(0, 4),
    ifWrongThen: "",
  };
}


/**
 * explore 兜底：模型没排线路图时，把整体目标当成唯一一条主线。
 * 这是「只有一条线」的退化形态，不是替用户发明新方向。
 */
function fallbackMainTrack(goal: string, milestone: string): InboxPlanTrack {
  const first = goal.split(/[，,。；;：:！？!?\n]/)[0]?.trim() || "";
  const name = (first || "主线").slice(0, 12);
  const intent = (milestone || goal).trim().slice(0, 200);
  return { name, intent: intent || name, role: "main" };
}

function readComposedPlan(
  raw: unknown,
  input: NormalAgentInput,
  brief: NormalAgentBrief,
  contentTrace: InboxPlanContentTrace | null = null,
): InboxPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const userCard = readUserCard(value.userCard);
  if (!userCard) return null;
  const rawTasks = Array.isArray(value.tasks) ? value.tasks : [];
  const maxTasks = Math.min(input.maxTasks ?? MAX_CHAIN_TASKS, MAX_CHAIN_TASKS);
  const rawTaskList = rawTasks
    .map(safePlanTask)
    .filter((task) => task.title !== "待整理任务")
    .slice(0, maxTasks);
  if (!rawTaskList.length) return null;

  const action =
    value.action === "existing_project" || value.action === "create_project"
      ? value.action
      : "single_task";
  const projectName = normalizeProjectName(value.projectName, brief.goal);
  const projectObjective = readText(value.projectObjective, 500) || projectName;
  const projectMilestone =
    readText(value.projectMilestone, 240) || rawTaskList[0]?.doneWhen || projectObjective;
  // 模式已在澄清收口时定好；第 3 段只承接，不再自己判。
  const mode: ProjectMode =
    input.workMode ??
    (value.mode === "longterm" || value.mode === "explore"
      ? value.mode
      : "normal");

  // 线路只在 explore 模式成立：其他模式即使模型多给了 tracks 也丢掉。
  const parsedTracks = readPlanTracks(value.tracks);
  const tracks: InboxPlanTrack[] =
    mode === "explore"
      ? parsedTracks.length
        ? parsedTracks
        : [fallbackMainTrack(brief.goal, projectMilestone)]
      : [];
  const trackByName = new Map(tracks.map((track) => [track.name, track]));
  const mainTrackName = tracks.find((track) => track.role === "main")?.name ?? null;
  const tasks = rawTaskList.map((task) => {
    if (!tracks.length) return { ...task, trackName: null };
    const named =
      typeof task.trackName === "string" && trackByName.has(task.trackName)
        ? task.trackName
        : null;
    // 唯一一条线时任务不必标；多条线时未标的归主线，避免线路图漏掉执行动作。
    const trackName = named ?? (tracks.length === 1 ? tracks[0].name : mainTrackName);
    return { ...task, trackName };
  });

  return {
    action,
    taskDisposition: "new_tasks",
    projectName,
    projectObjective,
    projectMilestone,
    tasks,
    tracks,
    mode,
    reason: readText(value.reason, 500),
    source: "model",
    session: buildDecisionSession({
      stage: "execute",
      kind: "plan",
      coreNeedHypothesis: brief.goal,
      recommendation: userCard.firstAction,
      nextAction: tasks[0]?.title ?? userCard.firstAction,
      fallback: userCard.ifWrongThen ?? "",
      confidence: 0.82,
    }),
    userCard,
    sources: webEvidenceSources(input.webEvidence),
    agent: {
      usedFacts: readList(value.usedFacts),
      assumptionsUsed: readList(value.assumptionsUsed),
      auditIssues: [],
    },
    content: contentTrace,
  };
}

async function callNormalAgent(input: {
  system: string;
  payload: unknown;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  onDelta?: (delta: string) => void;
  qualityRules?: string;
}) {
  return callModel(
    input.system,
    JSON.stringify(input.payload),
    input.apiKey,
    input.model,
    input.baseUrl,
    input.temperature,
    {
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      totalBudgetMs: input.timeoutMs,
      maxAttempts: 1,
      reasoningEffort: "none",
      onDelta: input.onDelta,
      qualityRules: input.qualityRules,
    },
  );
}

type PlanCriticResult = {
  score: number;
  verdict: string;
  issues: string[];
  rewriteInstructions: string[];
};

const PLAN_CRITIC_MIN_SCORE = 8;

function readCriticResult(raw: unknown): PlanCriticResult | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const rawScore =
    typeof value.score === "number" ? value.score : Number(value.score);
  if (!Number.isFinite(rawScore)) return null;
  return {
    score: Math.max(0, Math.min(10, rawScore)),
    verdict: readText(value.verdict, 300),
    issues: readList(value.issues, 6, 260),
    rewriteInstructions: readList(value.rewriteInstructions, 6, 260),
  };
}

async function critiqueNormalAgentPlan(input: {
  content: string;
  translation: InboxClarificationTranslation;
  summary?: InboxClarificationSummary | null;
  plan: NormalAgentPlan;
  composed: InboxPlan;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs: number;
}): Promise<PlanCriticResult | null> {
  const text = await callNormalAgent({
    system: PLAN_CRITIC_SYSTEM_PROMPT,
    payload: {
      originalIdea: input.content,
      translation: input.translation,
      summary: input.summary ?? null,
      plan: input.plan,
      composed: {
        projectName: input.composed.projectName,
        projectObjective: input.composed.projectObjective,
        projectMilestone: input.composed.projectMilestone,
        reason: input.composed.reason,
        userCard: input.composed.userCard,
        tasks: input.composed.tasks,
      },
    },
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
    temperature: 0.1,
    maxTokens: 1200,
    timeoutMs: input.timeoutMs,
  });
  return readCriticResult(parseObject(text));
}

export function isPlanCriticEnabled() {
  return process.env.PLAN_CRITIC !== "false";
}

export function isNormalAgentPlanEnabled() {
  return process.env.NORMAL_AGENT_PLAN !== "false";
}

export function isContentAgentEnabled() {
  return process.env.CONTENT_AGENT_PLAN !== "false";
}

export async function planNormalWithAgents(
  input: NormalAgentInput,
): Promise<NormalAgentOutcome> {
  if (!isNormalAgentPlanEnabled()) return { status: "disabled" };

  // 整条规划链共用一份时间预算。单次模型调用各自超时还不够，
  // 否则“方案 + 重写 + 旧链兜底”叠加后会超过小程序请求超时。
  const startedAt = Date.now();
  const totalBudgetMs = 22_000;
  const remainingBudgetMs = () => Math.max(0, totalBudgetMs - (Date.now() - startedAt));
  const callTimeoutMs = (requested: number, reserveMs = 1_200) =>
    Math.max(0, Math.min(requested, remainingBudgetMs() - reserveMs));

  const common = {
    originalIdea: input.content,
    clarificationHistory: (input.history ?? []).map((item) => ({
      question: item.question,
      answers: item.answer,
      reflection: item.reflection ?? null,
    })),
    clarificationSummary: input.summary ?? null,
    clarificationFrame: input.frame ?? null,
    projectContext: input.projectContext ?? [],
    memorySummary: input.memorySummary ?? null,
    contextEvidence: input.evidence ?? [],
    decisionMemory: input.decisionMemory ?? [],
    currentDate: toDateInputValue(new Date()),
  };

  // 链路第 1 段：翻译。调用方没带 translation 时在这里补齐，
  // 保证后面的方案 Agent 永远基于同一份结构化语义。
  const translation =
    input.translation ??
    (
      await translateIdea({
        content: input.content,
        history: input.history,
        projectContext: input.projectContext,
        memorySummary: input.memorySummary,
        evidence: input.evidence,
        decisionMemory: input.decisionMemory,
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: input.baseUrl,
      })
    ).translation;

  const webEvidence =
    input.webEvidence ??
    (await collectPlanWebEvidence({
      content: input.content,
      history: input.history,
      translation,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
    }));
  const inputWithEvidence = { ...input, webEvidence };

  const brief = {
    route: "normal" as const,
    reason: translation.reason || "链路第 1 段完成的语言翻译。",
    brief: buildBriefFromTranslation(input.content, translation),
  };

  // 新版两段链：翻译 Agent -> 方案 Agent。方案 Agent 直接产出行动卡和任务，
  // 旧的内容生成 + 收敛排版链只在它失败或显式关闭时回退。
  const useTwoStageAgent = process.env.TWO_STAGE_AGENT_PLAN !== "false";
  if (useTwoStageAgent) {
    const inferredJudgment = input.workMode
      ? null
      : await judgeWorkMode({
          content: input.content,
          translation,
          summary: input.summary,
          frame: input.frame,
          history: input.history,
          apiKey: input.apiKey,
          model: input.model,
          baseUrl: input.baseUrl,
        });
    const workMode = input.workMode ?? inferredJudgment?.mode ?? "normal";
    const modeJudgment = input.modeJudgment ?? inferredJudgment ?? null;
    const planInput = { ...inputWithEvidence, workMode, modeJudgment };
    const translationForPlan = {
      ...translation,
      desiredOutcome:
        translation.desiredOutcome || translation.normalizedIntent,
      workingAssumption:
        translation.workingAssumption ||
        input.summary?.workingAssumption ||
        translation.normalizedIntent,
      ifWrongThen:
        translation.ifWrongThen || input.summary?.ifWrongThen || "",
    };
    const planPayload = {
      translation: translationForPlan,
      workMode,
      modeJudgment,
      currentDate: common.currentDate,
      maxTasks: Math.min(input.maxTasks ?? MAX_CHAIN_TASKS, MAX_CHAIN_TASKS),
      originalIdea: input.content,
      contextSummary: input.memorySummary ?? null,
      contextEvidence: input.evidence ?? [],
      webEvidence: webEvidenceForModel(webEvidence),
      projectContext: input.projectContext ?? [],
      decisionMemory: input.decisionMemory ?? [],
      clarificationHistory: common.clarificationHistory,
      clarificationSummary: input.summary ?? null,
      clarificationFrame: input.frame ?? null,
      brief: brief.brief,
    };
    const runPlanAgent = (payload: unknown, temperature: number, timeoutMs: number) =>
      callNormalAgent({
        system: buildPlanAgentSystemPrompt(workMode),
        payload,
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: input.baseUrl,
        temperature,
        maxTokens: 2600,
        timeoutMs,
        onDelta: input.onDelta,
      });

    const firstTimeout = callTimeoutMs(20_000);
    let planText = firstTimeout >= 2_000 ? await runPlanAgent(planPayload, 0.2, firstTimeout) : null;
    let twoStagePlan = readComposedPlan(
      parseObject(planText),
      planInput,
      brief.brief,
      null,
    );
    let twoStageIssues = twoStagePlan
      ? auditNormalAgentPlan(twoStagePlan, brief.brief)
      : [];
    let retryWorthy = twoStageIssues.filter(
      (issue) => !issue.includes("软件点击教程"),
    );
    const retryTimeout = callTimeoutMs(20_000);
    if ((!twoStagePlan || retryWorthy.length) && retryTimeout >= 2_000) {
      planText = await runPlanAgent(
        { ...planPayload, previousAuditIssues: retryWorthy },
        0.15,
        retryTimeout,
      );
      const retryPlan = readComposedPlan(
        parseObject(planText),
        planInput,
        brief.brief,
        null,
      );
      if (retryPlan) {
        twoStagePlan = retryPlan;
        twoStageIssues = auditNormalAgentPlan(twoStagePlan, brief.brief);
      }
    }
    if (twoStagePlan) {
      attachWebEvidenceSources(twoStagePlan, webEvidence);
      if (twoStageIssues.length) {
        console.warn(
          "[agent-plan] two-stage audit accepted with warnings",
          twoStageIssues,
        );
      }
      twoStagePlan.agent = {
        usedFacts: twoStagePlan.agent?.usedFacts ?? [],
        assumptionsUsed: twoStagePlan.agent?.assumptionsUsed ?? [],
        auditIssues: twoStageIssues,
      };
      twoStagePlan.content = null;
      return { status: "ok", plan: twoStagePlan };
    }
    if (remainingBudgetMs() <= 6_000) {
      return {
        status: "failed",
        reason: "规划时间预算用尽",
        issues: ["规划超时"],
      };
    }
    console.warn(
      "[agent-plan] two-stage plan failed; falling back to legacy chain",
    );
  }

  let agentPlan: NormalAgentPlan | null = null;
  let contentTrace: InboxPlanContentTrace | null = null;
  const contentTimeout = callTimeoutMs(20_000, 3_000);
  if (isContentAgentEnabled() && contentTimeout >= 4_000) {
    const content = await runContentAgent({
      content: input.content,
      translation,
      history: input.history,
      summary: input.summary,
      frame: input.frame,
      projectContext: input.projectContext,
      memorySummary: input.memorySummary,
      evidence: input.evidence,
      webEvidence: webEvidenceForModel(webEvidence),
      decisionMemory: input.decisionMemory,
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
      timeoutMs: contentTimeout,
    });
    if (content.plan) {
      agentPlan = content.plan;
      contentTrace = {
        enabled: true,
        stepCount: content.plan.steps.length,
        usedTranslation: content.usedTranslation,
        goal: content.plan.goal,
        constraints: content.plan.constraints,
        route: content.plan.route,
        steps: content.plan.steps,
      };
    }
  }

  if (!agentPlan) {
    const strategyTimeout = callTimeoutMs(10_000);
    if (strategyTimeout < 2_000) {
      return {
        status: "failed",
        reason: "规划时间预算用尽",
        issues: ["规划超时"],
      };
    }
    const strategyText = await callNormalAgent({
      system: NORMAL_STRATEGY_SYSTEM_PROMPT,
      payload: {
        brief: brief.brief,
        originalIdea: input.content,
        projectContext: input.projectContext ?? [],
        webEvidence: webEvidenceForModel(webEvidence),
        decisionMemory: input.decisionMemory ?? [],
      },
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
      temperature: 0.7,
      maxTokens: 1600,
      timeoutMs: strategyTimeout,
    });
    agentPlan = readPlan(parseObject(strategyText));
    if (!agentPlan) {
      console.warn("[agent-plan] failed: no usable plan");
      return {
        status: "failed",
        reason: "规划执行阶段没有拿到可用规划",
        issues: ["规划为空"],
      };
    }
  }

  const composePayload = {
    brief: brief.brief,
    plan: agentPlan,
    workMode: input.workMode ?? null,
    originalIdea: input.content,
    projectContext: input.projectContext ?? [],
    webEvidence: webEvidenceForModel(webEvidence),
    decisionMemory: input.decisionMemory ?? [],
    currentDate: common.currentDate,
    maxTasks: Math.min(input.maxTasks ?? MAX_CHAIN_TASKS, MAX_CHAIN_TASKS),
  };

  const composeTimeout = callTimeoutMs(20_000);
  if (composeTimeout < 2_000) {
    return {
      status: "failed",
      reason: "规划时间预算用尽",
      issues: ["规划超时"],
    };
  }
  let planText = await callNormalAgent({
    system: NORMAL_COMPOSE_SYSTEM_PROMPT_V1,
    payload: composePayload,
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
    temperature: 0.2,
    maxTokens: 2600,
    timeoutMs: composeTimeout,
    onDelta: input.onDelta,
  });
  let plan = readComposedPlan(
    parseObject(planText),
    inputWithEvidence,
    brief.brief,
    contentTrace,
  );
  let auditIssues = plan
    ? auditNormalAgentPlan(plan, brief.brief)
    : [];

  let criticTrace: string[] = [];
  const criticTimeout = callTimeoutMs(10_000, 2_000);
  if (
    plan &&
    isPlanCriticEnabled() &&
    criticTimeout >= 2_000 &&
    !auditIssues.some((issue) => !issue.includes("软件点击教程"))
  ) {
    const critic = await critiqueNormalAgentPlan({
      content: input.content,
      translation,
      summary: input.summary ?? null,
      plan: agentPlan,
      composed: plan,
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
      timeoutMs: criticTimeout,
    });
    if (critic) {
      console.warn("[agent-plan] critic", critic);
      if (critic.score < PLAN_CRITIC_MIN_SCORE) {
        criticTrace = [
          ...critic.issues.map((issue) => "质检：" + issue),
          ...critic.rewriteInstructions.map((item) => "质检要求：" + item),
        ];
        auditIssues = [...auditIssues, ...criticTrace];
      }
    }
  }

  // 风格类小毛病（典型："写了软件点击教程"）不值得为它重写一整个计划：
  // 实测重写既慢 10-20 秒、又经常改不掉。记录成警告，别拿它当重写理由。
  // 其余审计问题（结构缺失、把判断推回用户、没用到已确认事实等）照旧触发重写。
  const retryWorthy = auditIssues.filter(
    (issue) => !issue.includes("软件点击教程"),
  );

  // 结构不完整（缺 userCard / tasks / selectedApproachId，或不是合法 JSON）和
  // 审计不通过一样，都要重写一次；之前结构坏了直接判失败，太脆。
  if (!plan || retryWorthy.length) {
    const retryNotes = plan
      ? retryWorthy
      : [
          "上一次输出不是完整 JSON，或缺少 userCard（understanding / firstAction / how / doneWhen）、tasks（至少一条）或 selectedApproachId。请严格按格式重写，只返回 JSON。",
        ];
    const retryComposeTimeout = callTimeoutMs(20_000);
    if (retryComposeTimeout < 2_000) {
      return {
        status: "failed",
        reason: "规划时间预算用尽",
        issues: ["规划超时"],
      };
    }
    console.warn("[agent-plan] compose retry", retryNotes);
    planText = await callNormalAgent({
      system: NORMAL_COMPOSE_SYSTEM_PROMPT_V1,
      payload: { ...composePayload, previousAuditIssues: retryNotes },
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
      temperature: 0.15,
      maxTokens: 2600,
      timeoutMs: retryComposeTimeout,
      onDelta: input.onDelta,
    });
    const retryPlan = readComposedPlan(
      parseObject(planText),
      input,
      brief.brief,
      contentTrace,
    );
    if (retryPlan) {
      plan = retryPlan;
      auditIssues = auditNormalAgentPlan(plan, brief.brief);
    }
  }

  if (!plan) {
    console.warn(
      "[agent-plan] failed: compose incomplete after retry; raw=",
      (planText ?? "").slice(0, 300),
    );
    return {
      status: "failed",
      reason: "重写后仍然没有形成完整行动卡",
      issues: ["计划结构不完整"],
    };
  }
  if (auditIssues.length) {
    console.warn("[agent-plan] audit accepted with warnings", auditIssues);
  }

  plan.agent = {
    usedFacts: plan.agent?.usedFacts ?? [],
    assumptionsUsed: plan.agent?.assumptionsUsed ?? [],
    auditIssues: [
      ...auditIssues,
      ...(criticTrace.length
        ? ["质检曾触发一次重写：" + criticTrace.join("；")]
        : []),
    ],
  };
  plan.content = contentTrace;
  attachWebEvidenceSources(plan, webEvidence);
  return { status: "ok", plan };
}
