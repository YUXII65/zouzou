import { toDateInputValue } from "@/lib/date";
import { pickModeFromJudgment } from "@/lib/mode-judgment";
import {
  heuristicProjectMode,
  isProjectMode,
  normalizeProjectMode,
  type ProjectMode,
} from "@/lib/work-mode";
import { after } from "next/server";
import { buildTaskContract } from "@/lib/task-contract";
import { assessIdeaReadiness, type IdeaReadiness } from "@/lib/idea-readiness";
import { extractJsonObject as extractJson } from "@/lib/json-extract";
import {
  buildDecisionSession,
  routeDecisionKind,
  type DecisionSession,
} from "@/lib/decision";
import {
  collapsePlannedTasks,
  MAX_AI_TASKS_PER_PLAN,
  MAX_REVIEW_NEXT_ACTIONS,
} from "@/lib/task-flow";
import {
  estimateAiUsage,
  hasAiQuota,
  isAiQuotaEnabled,
  recordAiUsage,
} from "@/lib/ai-quota";
import {
  CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
  MODE_JUDGMENT_SYSTEM_PROMPT,
  OUTPUT_QUALITY_RULES,
  PLAN_SYSTEM_PROMPT,
  buildClarificationTranslationUserPayload,
  buildModeJudgmentUserPayload,
  buildPlanUserPayload,
} from "@/lib/ai-prompts";

/** 探索模式的「线路」：一个发展方向；只有一个方向时就是一条主线。 */
export type InboxPlanTrack = {
  name: string;
  intent: string;
  role: "main" | "side";
};

export type InboxPlanTask = {
  title: string;
  shortTitle: string;
  executionMode: string;
  doneWhen: string;
  methodHint: string;
  recommendation: string;
  executionSteps: string[];
  fallback: string;
  maxTurns: number;
  toolPolicy: string;
  notes: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  scheduledDate: string | null;
  dueDate: string | null;
  /** explore 计划里这条任务属于哪条线（线路名），其他模式为 null。 */
  trackName?: string | null;
};

export type InboxPlanSource =
  | "model"
  | "heuristic_fallback"
  | "agent_failed";

export type InboxPlanUserCard = {
  understanding: string;
  firstAction: string;
  how: string;
  doneWhen: string;
  ifWrongThen?: string;
};

export type InboxPlanAgentTrace = {
  usedFacts: string[];
  assumptionsUsed: string[];
  auditIssues: string[];
};

export type InboxPlanContentTrace = {
  enabled: boolean;
  /** 第二段规划执行 Agent 排出的步骤数。 */
  stepCount: number;
  usedTranslation: boolean;
  /** 第二段规划执行 Agent 的自然语言输出，用于调试查看。 */
  goal?: string;
  constraints?: string[];
  route?: string;
  steps?: Array<{ action: string; how: string; output: string }>;
  responseMode?: InboxPlanResponseMode;
  answer?: string;
};

export type InboxPlanResponseMode = "answer" | "action" | "plan";

export type InboxPlan = {
  action: "create_project" | "existing_project" | "single_task" | "ignore" | "answer";
  responseMode?: InboxPlanResponseMode;
  directAnswer?: string | null;
  taskDisposition?: "attach" | "new_tasks";
  projectName: string | null;
  projectObjective: string | null;
  projectMilestone: string | null;
  tasks: InboxPlanTask[];
  /** explore 模式的线路图；其他模式为空。线路可以不只一条，也可以只有一条。 */
  tracks?: InboxPlanTrack[] | null;
  /** 项目最终归属的模式（v3.3 文件页用它分类） */
  mode?: ProjectMode;
  reason: string;
  session?: DecisionSession | null;
  source?: InboxPlanSource;
  userCard?: InboxPlanUserCard | null;
  agent?: InboxPlanAgentTrace | null;
  content?: InboxPlanContentTrace | null;
};

export type FirstRunPlan = {
  projectName: string;
  objective: string;
  milestone: string;
  taskTitle: string;
  taskShortTitle: string;
  taskExecutionMode: string;
  taskDoneWhen: string;
  taskMethodHint: string;
  taskRecommendation: string;
  taskExecutionSteps: string[];
  taskFallback: string;
  taskMaxTurns: number;
  taskToolPolicy: string;
};

export type FirstRunPlanResult = FirstRunPlan & {
  usedFallback: boolean;
};

export type InboxClarificationDimension = {
  key: string;
  question: string;
  options: string[];
  multi?: boolean;
};

export type InboxClarificationHistoryItem = InboxClarificationDimension & {
  answer: string[];
  reflection?: string | null;
};

export type InboxClarificationTranslation = {
  originalInput: string;
  literalMeaning: string;
  normalizedIntent: string;
  confirmedFacts: string[];
  interpretations: string[];
  valueJudgments: string[];
  goals: string[];
  constraints: string[];
  unknowns: string[];
  readiness: IdeaReadiness;
  missingSlots: string[];
  reason: string;
  responseMode?: InboxPlanResponseMode;
};

export type InboxClarificationFrame = {
  surfaceRequest: string;
  coreNeedHypothesis: string;
  decisionFork: string;
  decisiveUnknown: string;
  whyItChangesPlan: string;
  workingAssumptions: string[];
  methodOptions: string[];
  readiness: IdeaReadiness;
  missingSlots: string[];
  completionPrompt: string;
  completionOptions: string[];
};

export type InboxClarificationSummary = {
  originalIdea: string;
  realProblem: string;
  confirmedFacts: string[];
  interpretations: string[];
  valueJudgments: string[];
  goals: string[];
  unverifiedAssumptions: string[];
  keyVariable: string;
  /** 旧字段，兼容已经保存的澄清状态；新流程优先使用 workingAssumption。 */
  newQuestion?: string;
  workingAssumption?: string;
  ifWrongThen?: string;
};

export type InboxClarification = {
  dimensions: InboxClarificationDimension[];
  supplementPlaceholder: string;
  mode?: "socratic";
  /** 澄清收口后定下的推进模式；第 2、3 段只承接，不再自己判。 */
  workMode?: ProjectMode | null;
  status?: "asking" | "done";
  askedCount?: number;
  maxQuestions?: number;
  history?: InboxClarificationHistoryItem[];
  summary?: InboxClarificationSummary | null;
  translation?: InboxClarificationTranslation | null;
  frame?: InboxClarificationFrame | null;
  session?: DecisionSession | null;
};

export type InboxProjectContext = {
  name: string;
  objective: string | null;
  currentMilestone: string | null;
  openTaskCount?: number;
  openTasks?: Array<{
    id: string;
    title: string;
    shortTitle: string | null;
    status: string;
  }>;
};

export type TaskEditSuggestion = {
  title?: string;
  shortTitle?: string;
  notes?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  scheduledDate?: string | null;
  dueDate?: string | null;
  focusDate?: string | null;
  reason: string;
  decision?: DecisionSession | null;
};

export type ProjectEditSuggestion = {
  name?: string;
  objective?: string;
  currentMilestone?: string | null;
  status?: string;
  notes?: string | null;
  reason: string;
  decision?: DecisionSession | null;
};

export type TaskCoachAdvice = {
  title: string;
  encouragement: string;
  steps: string[];
  nextStep: string;
};

export type TodaySuggestion = {
  taskId: string;
  title: string;
  projectName: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  reason: string;
  evidence: string[];
  decision?: DecisionSession | null;
};

export type TaskShortTitleSuggestion = {
  shortTitle: string;
};

export type ReviewDraft = {
  summary: string;
  nextActions: string;
};

type FocusTask = {
  id: string;
  title: string;
  projectName: string | null;
  priority: string;
  dueDate: Date | null;
  scheduledDate: Date | null;
  /** 同一批计划里的原定顺序；用来判断「谁是谁的前提」 */
  planOrder?: number | null;
  /** 同一批 AI 计划共享的 id，同批任务之间才有顺序含义 */
  batchId?: string | null;
};

const priorities = ["low", "medium", "high", "urgent"] as const;
const planActions = [
  "create_project",
  "existing_project",
  "single_task",
  "ignore",
] as const;

function firstLine(content: string) {
  return content.split(/\r?\n/)[0]?.trim() || content.slice(0, 80);
}


function safePriority(value: unknown) {
  return priorities.includes(value as (typeof priorities)[number])
    ? (value as (typeof priorities)[number])
    : "medium";
}

function safePlanAction(value: unknown) {
  return planActions.includes(value as (typeof planActions)[number])
    ? (value as (typeof planActions)[number])
    : "single_task";
}

/** 便利贴最多保留 3 个真实阶段；多出来的动作合并进最后一块，避免把连续动作拆碎。 */
export function collapseExecutionSteps(steps: string[], limit = 3) {
  if (steps.length <= limit) return steps;
  const kept = steps.slice(0, Math.max(1, limit - 1));
  const rest = steps.slice(Math.max(1, limit - 1));
  return [...kept, rest.join("；")];
}

export function safePlanTask(value: unknown): InboxPlanTask {
  if (!value || typeof value !== "object") {
    return {
      title: "待整理任务",
      shortTitle: "整理任务",
      executionMode: "quick",
      doneWhen: "拿到可以直接使用的答案或结果",
      methodHint: "先明确判断标准和边界，再给出一条现在就能用的答案",
      recommendation: "先按一个明确判断，给出一个现在就能执行的答案",
      executionSteps: ["明确判断标准", "给出一个可直接执行的答案"],
      fallback: "",
      maxTurns: 1,
      toolPolicy: "none",
      notes: null,
      priority: "medium",
      scheduledDate: null,
      dueDate: null,
      trackName: null,
    };
  }

  const raw = value as Record<string, unknown>;
  const today = toDateInputValue(new Date());
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 200)
      : "待整理任务";
  const notes =
    typeof raw.notes === "string" && raw.notes.trim()
      ? raw.notes.trim().slice(0, 500)
      : null;
  const contract = buildTaskContract(`${title} ${notes ?? ""}`, title);
  const executionSteps = Array.isArray(raw.executionSteps)
    ? collapseExecutionSteps(
        raw.executionSteps
          .filter(
            (step): step is string =>
              typeof step === "string" && Boolean(step.trim()),
          )
          .map((step) => step.trim().slice(0, 240)),
      )
    : [];
  const executionMode =
    typeof raw.executionMode === "string" && raw.executionMode.trim()
      ? raw.executionMode.trim()
      : contract.executionMode;
  const maxTurnsByMode: Record<string, number> = {
    quick: 1,
    tool: 2,
    produce: 2,
    explore: 3,
    project: 3,
  };

  return {
    title,
    shortTitle: normalizeShortTitle(raw.shortTitle, title),
    executionMode,
    doneWhen:
      typeof raw.doneWhen === "string" && raw.doneWhen.trim()
        ? raw.doneWhen.trim().slice(0, 200)
        : contract.doneWhen,
    methodHint:
      typeof raw.methodHint === "string" && raw.methodHint.trim()
        ? raw.methodHint.trim().slice(0, 240)
        : contract.methodHint,
    recommendation:
      typeof raw.recommendation === "string" && raw.recommendation.trim()
        ? raw.recommendation.trim().slice(0, 400)
        : contract.methodHint,
    executionSteps: executionSteps.length
      ? executionSteps
      : [contract.methodHint],
    fallback:
      typeof raw.fallback === "string" && raw.fallback.trim()
        ? raw.fallback.trim().slice(0, 300)
        : "",
    maxTurns: maxTurnsByMode[executionMode] ?? contract.maxTurns,
    toolPolicy:
      typeof raw.toolPolicy === "string" && raw.toolPolicy.trim()
        ? raw.toolPolicy.trim()
        : contract.toolPolicy,
    notes,
    priority: safePriority(raw.priority),
    scheduledDate:
      typeof raw.scheduledDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.scheduledDate) &&
      raw.scheduledDate >= today
        ? raw.scheduledDate
        : null,
    dueDate:
      typeof raw.dueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) &&
      raw.dueDate >= today
        ? raw.dueDate
        : null,
    trackName:
      typeof raw.trackName === "string" && raw.trackName.trim()
        ? raw.trackName.trim().slice(0, 40)
        : null,
  };
}

export type CallModelOptions = {
  onDelta?: (delta: string) => void;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max";
  maxTokens?: number;
  qualityRules?: string;
  timeoutMs?: number;
  totalBudgetMs?: number;
  maxAttempts?: number;
};

type ChatCompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

type ChatCompletionPayload = {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
  usage?: ChatCompletionUsage;
};

async function readStreamingContent(
  response: Response,
  onDelta: (delta: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) return { content: "", usage: undefined };

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: ChatCompletionUsage | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payloadText = line.slice(5).trim();
      if (!payloadText || payloadText === "[DONE]") continue;

      try {
        const payload = JSON.parse(payloadText) as ChatCompletionPayload;
        const delta = payload.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          content += delta;
          onDelta(delta);
        }
        if (payload.usage) usage = payload.usage;
      } catch {
        // Some compatible providers send keep-alive data that is not JSON.
      }
    }
  }

  return { content, usage };
}

export async function callModel(
  system: string,
  user: string,
  apiKeyOverride?: string,
  modelOverride?: string,
  baseUrlOverride?: string,
  temperatureOverride = 0.2,
  options: CallModelOptions = {},
) {
  const apiKey =
    apiKeyOverride ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model =
    modelOverride ||
    process.env.DEEPSEEK_MODEL ||
    process.env.OPENAI_MODEL ||
    "deepseek-flash";
  const baseUrl = (
    baseUrlOverride ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com"
  ).replace(/\/$/, "");

  const startedAt = Date.now();
  const totalBudgetMs = options.totalBudgetMs ?? 26_000;
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 2));
  let streamed = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isAiQuotaEnabled() && !(await hasAiQuota())) return null;

    // 超过总预算就不再重试，避免按钮长时间停在“处理中”。
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    if (remaining <= 2_000) return null;

    try {
      const shouldStream = Boolean(options.onDelta);
      const useDeepSeekReasoningControl =
        /deepseek/i.test(model) || /deepseek/i.test(baseUrl);
      const requestedReasoningEffort = options.reasoningEffort;
      const reasoningEffort =
        requestedReasoningEffort === "medium"
          ? undefined
          : requestedReasoningEffort;
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `${system}\n\n${options.qualityRules ?? OUTPUT_QUALITY_RULES}`,
            },
            { role: "user", content: user },
          ],
          temperature: temperatureOverride,
          ...(useDeepSeekReasoningControl && reasoningEffort
            ? { reasoning_effort: reasoningEffort }
            : {}),
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(shouldStream
            ? {
                stream: true,
                stream_options: { include_usage: true },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(Math.min(options.timeoutMs ?? 20_000, remaining)),
      });

      if (!response.ok) {
        console.warn(`[ai] request failed with ${response.status}`);
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < maxAttempts - 1 &&
          totalBudgetMs - (Date.now() - startedAt) > 6_000
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        return null;
      }

      const streamedResponse = shouldStream
        ? await readStreamingContent(response, (delta) => {
            streamed = true;
            options.onDelta?.(delta);
          })
        : null;
      const data = streamedResponse
        ? null
        : ((await response.json()) as ChatCompletionPayload);
      const content =
        streamedResponse?.content ??
        data?.choices?.[0]?.message?.content ??
        null;
      const responseUsage = streamedResponse?.usage ?? data?.usage;

      const usage = responseUsage
        ? {
            promptTokens: responseUsage.prompt_tokens ?? 0,
            completionTokens: responseUsage.completion_tokens ?? 0,
            totalTokens: responseUsage.total_tokens ?? 0,
            promptCacheHitTokens: responseUsage.prompt_cache_hit_tokens ?? null,
            promptCacheMissTokens: responseUsage.prompt_cache_miss_tokens ?? null,
            model,
          }
        : await estimateAiUsage({ system, user }, content);
      after(() => recordAiUsage(usage));

      console.info(
        `[ai] model=${model} stream=${shouldStream ? "yes" : "no"} total=${Date.now() - startedAt}ms`,
      );
      return content;
    } catch (error) {
      console.warn("[ai] request error", error);
      if (
        !streamed &&
        attempt < maxAttempts - 1 &&
        totalBudgetMs - (Date.now() - startedAt) > 6_000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      return null;
    }
  }

  return null;
}

/** 用户显式选了模式就用它；smart / 缺省才回落到推断值。 */
function resolvePlanMode(workMode: unknown, hint: ProjectMode): ProjectMode {
  return isProjectMode(workMode) ? workMode : hint;
}

function heuristicPlan(
  content: string,
  projectNames: string[],
  workMode?: string,
): InboxPlan {
  const lower = content.toLowerCase();
  const projectName =
    projectNames.find((name) => lower.includes(name.toLowerCase())) ?? null;

  if (/(忽略|不用处理|删除|暂时不要)/.test(lower)) {
    return {
      action: "ignore",
      projectName,
      projectObjective: null,
      projectMilestone: null,
      tasks: [],
      reason: "本地规则：内容包含忽略类关键词",
    };
  }

  const first = firstLine(content);
  const short = first.length > 24 ? `${first.slice(0, 24)}…` : first;
  const generatedProjectName =
    first
      .replace(/^(?:今天|明天|这周|本周|先|请|帮我|需要|想要?|把)\s*/u, "")
      .replace(/[，,。；;！？!?]/g, " ")
      .trim()
      .slice(0, 20) || "第一个项目";
  const taskTitle = /卡|难|累|焦虑|压力|害怕|不确定|迷茫|拖延|没时间/.test(
    lower,
  )
    ? `动手排除「${short}」里卡住的那一步`
    : /用户|需求|反馈|市场|聊天|访谈|验证/.test(lower)
      ? `找真实用户验证「${short}」并记下结论`
      : /写|作品|网站|产品|发布|上线|原型|创作/.test(lower)
        ? `把「${short}」做出一个能给别人看的版本`
        : /学习|学|考试|复习|练习/.test(lower)
          ? `把「${short}」练出今天第一个能看见的结果`
          : `围绕「${short}」做出今天能交付的成果`;
  const contract = buildTaskContract(content, taskTitle);

  return {
    action: projectName ? "existing_project" : "single_task",
    mode: resolvePlanMode(
      workMode,
      heuristicProjectMode(content, Boolean(projectName)),
    ),
    projectName: projectName ?? generatedProjectName,
    projectObjective: first,
    projectMilestone: `围绕「${short}」产出一个能被别人直接看到的结果`,
    tasks: [
      {
        title: taskTitle,
        shortTitle: normalizeShortTitle(null, taskTitle),
        executionMode: contract.executionMode,
        doneWhen: contract.doneWhen,
        methodHint: contract.methodHint,
        recommendation: contract.methodHint,
        executionSteps: [contract.methodHint],
        fallback: "",
        maxTurns: contract.maxTurns,
        toolPolicy: contract.toolPolicy,
        notes: first,
        priority:
          /(紧急|尽快|今天|立刻)/.test(lower)
            ? "high"
            : "medium",
        scheduledDate: null,
        dueDate: null,
      },
    ],
    reason: projectName
      ? "本地规则：AI 暂不可用，先按当前项目方向生成一个具体动作"
      : "本地规则：AI 暂不可用，先按这句话生成一个具体动作",
  };
}

function normalizeShortTitle(value: unknown, fallbackTitle: string) {
  const candidate =
    typeof value === "string" && value.trim()
      ? value.trim().replace(/[“”"「」]/g, "")
      : fallbackTitle.trim();
  const cleaned = candidate
    .replace(/^(?:今天|明天|本周|这周|接下来|然后|需要|请)\s*/u, "")
    .replace(/^(?:花|用)\s*\d+\s*(?:分钟|小时)\s*/u, "")
    .replace(/^只(?:做|要)\s*/u, "")
    .trim();
  const compact =
    cleaned.split(/[：:]/).filter(Boolean).at(-1)?.split(/[，,。；;！？!?]/)[0]?.trim() ||
    cleaned;

  return compact.length > 18 ? `${compact.slice(0, 17).trim()}…` : compact;
}

function heuristicFirstRun(content: string): FirstRunPlan {
  const clean = content.trim().replace(/\s+/g, " ");
  const short = clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
  const topic =
    clean
      .replace(/^(?:我?想(?:做|要|把|开始|尝试|搞)?|做(?:个|一个)?|搞(?:个|一个)?)/, "")
      .split(/[，。！？,.!?\n]/)[0]
      .trim() || short;
  const isBlocked =
    /卡|难|累|焦虑|压力|害怕|不确定|迷茫|拖延|没时间/.test(clean);
  const isValidation = /用户|需求|反馈|市场|聊天|访谈|验证|选型|方案/.test(
    clean,
  );
  const isCreation = /写|作品|网站|产品|发布|上线|原型|创作/.test(clean);
  const isLearning = /学习|学|考试|复习|练习/.test(clean);
  const isKnowledge = /笔记|读书|阅读|知识|资料|摘录|书里|看过的书/.test(clean);
  const isEvent = /组织|活动|大家|预算|参与者|群|聚会|旅行|徒步/.test(clean);
  const isFamilyHealth = /父母|爸妈|家人|体检|健康|医院|医生/.test(clean);
  const isRelationship = /室友|同事|朋友|伴侣|沟通|关系|边界/.test(clean);
  const isChoice = /考研|换城市|转行|选择|取舍|要不要|犹豫/.test(clean);
  const isHome = /整理|收纳|房间|台面|衣柜|家里|收拾/.test(clean);
  const isFinance = /存钱|预算|记账|支出|储蓄|理财/.test(clean);
  const taskTitle = isKnowledge
    ? `选一本读过的书，整理 3 个还能记起、也愿意复用的观点`
    : isFamilyHealth
    ? `给家人打一次电话，问清他们对体检的具体顾虑`
    : isRelationship
      ? `写下最近三次具体事实，并准备一次简短沟通`
      : isChoice
        ? `写下这次选择最在意的 3 个判断标准`
        : isHome
          ? `先处理一个最影响日常的小区域`
          : isFinance
            ? `把最近一个月固定支出列出来`
    : isBlocked
    ? `把「${topic}」里最卡的一处写成一句话`
    : isValidation
      ? `找一个可能相关的人，问一个关于「${topic}」的具体问题`
      : isCreation
        ? `给「${topic}」做出一个能看见轮廓的粗糙版本`
        : isLearning
          ? `把「${topic}」练出第一个能看见的结果`
          : `为「${topic}」做出一个能真正拿出手的结果`;
  const taskShortTitle = normalizeShortTitle(null, taskTitle);
  const taskContract = buildTaskContract(clean, taskTitle);
  const objective = isKnowledge
    ? "把读过的书里真正有用的观点整理成一份以后能查、能复用的笔记。"
    : isFamilyHealth
    ? "把家人对体检的顾虑和现实安排理清，先形成一次能执行的沟通和检查计划。"
    : isRelationship
      ? "把反复出现的摩擦说清楚，形成一条双方都能执行的约定。"
      : isChoice
        ? "把选择标准和现实条件对齐，再决定需要补哪一条关键信息。"
        : isHome
          ? "让空间重新变得顺手，并把整理控制在能持续维护的范围。"
          : isFinance
            ? "把现金流的真实情况看清，再决定从哪里开始调整。"
    : isValidation
    ? "把模糊想法整理成一条可验证的实现路径，先判断什么值得继续投入。"
      : isBlocked
      ? "先看清真正卡住的地方，再把负担缩小到可以重新开始。"
      : isCreation
        ? "先做出一个真实的人能看到、能直接指出哪里不行的版本，再决定下一轮改什么。"
        : isLearning
          ? "把学习目标落到一个真实场景，并建立可以重复的练习节奏。"
          : isEvent
            ? "把分散的参与者、时间和限制收成一个能够执行的默认方案。"
            : "先弄清这件事最想解决的问题，再选一个今天就能动手、也能看出结果的方向。";
  const milestone = isKnowledge
    ? "完成一页包含 3 个观点和对应使用场景的读书笔记"
    : isFamilyHealth
    ? "确认家人愿意讨论的顾虑，并选出一项最值得先推进的检查"
    : isRelationship
      ? "完成一次不互相指责的沟通，并确认一条具体约定"
      : isChoice
        ? "得到一条能真正改变判断的新信息"
        : isHome
          ? "让一个高频使用区域恢复顺手，并能维持一周"
          : isFinance
            ? "看清固定支出结构，并确定一个可执行的调整项"
    : isValidation
    ? "得到一条能判断方向是否成立的真实反馈"
      : isBlocked
      ? "明确一个可移除的阻力，并重新开始推进"
      : isCreation
        ? "有一个真实的人看过这版，并指出至少一处具体问题"
        : isLearning
          ? "完成一次练习，并能对出错的地方说清原因"
          : isEvent
            ? "锁定日期、预算和负责人"
            : "选出一个今天能动手、也看得出结果的方向";

  return {
    projectName: topic.slice(0, 10),
    objective,
    milestone,
    taskTitle,
    taskShortTitle,
    taskExecutionMode: taskContract.executionMode,
    taskDoneWhen: taskContract.doneWhen,
    taskMethodHint: taskContract.methodHint,
    taskRecommendation: taskContract.methodHint,
    taskExecutionSteps: [taskTitle],
    taskFallback: "",
    taskMaxTurns: taskContract.maxTurns,
    taskToolPolicy: taskContract.toolPolicy,
  };
}




function clarificationHistoryToDimensions(
  history: InboxClarificationHistoryItem[],
): InboxClarificationDimension[] {
  return history.map((item) => ({
    key: item.key,
    question: item.question,
    options: item.options,
    ...(item.multi ? { multi: true } : {}),
  }));
}



function normalizeClarificationTranslation(
  value: unknown,
  fallback: InboxClarificationTranslation,
): InboxClarificationTranslation {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const stringValue = (item: unknown, fallbackValue: string) =>
    typeof item === "string" && item.trim()
      ? item.trim().slice(0, 500)
      : fallbackValue;
  const stringList = (item: unknown, fallbackValue: string[]) =>
    Array.isArray(item)
      ? item
          .filter(
            (entry): entry is string =>
              typeof entry === "string" && Boolean(entry.trim()),
          )
          .slice(0, 6)
          .map((entry) => entry.trim().slice(0, 300))
      : fallbackValue;
  const readiness =
    raw.readiness === "ready" ||
    raw.readiness === "needs_context" ||
    raw.readiness === "needs_meaning"
      ? raw.readiness
      : fallback.readiness;
  const responseMode =
    raw.responseMode === "answer" || raw.responseMode === "action"
      ? raw.responseMode
      : fallback.responseMode ?? "plan";
  return {
    originalInput: stringValue(raw.originalInput, fallback.originalInput),
    literalMeaning: stringValue(raw.literalMeaning, fallback.literalMeaning),
    normalizedIntent: stringValue(
      raw.normalizedIntent,
      fallback.normalizedIntent,
    ),
    confirmedFacts: stringList(raw.confirmedFacts, fallback.confirmedFacts),
    interpretations: stringList(raw.interpretations, fallback.interpretations),
    valueJudgments: stringList(raw.valueJudgments, fallback.valueJudgments),
    goals: stringList(raw.goals, fallback.goals),
    constraints: stringList(raw.constraints, fallback.constraints),
    unknowns: stringList(raw.unknowns, fallback.unknowns),
    readiness,
    missingSlots: stringList(raw.missingSlots, fallback.missingSlots),
    reason: stringValue(raw.reason, fallback.reason),
    responseMode,
  };
}

function buildFallbackClarificationTranslation(
  content: string,
  history: InboxClarificationHistoryItem[],
  assessment = assessIdeaReadiness(content),
): InboxClarificationTranslation {
  const answers = history
    .flatMap((item) => item.answer)
    .map((answer) => answer.trim())
    .filter(Boolean);
  return {
    originalInput: content,
    literalMeaning: content,
    normalizedIntent: answers.length
      ? answers.join("；").slice(0, 500)
      : assessment.completionPrompt || content,
    confirmedFacts: answers.slice(0, 6),
    interpretations: [],
    valueJudgments: [],
    goals: [],
    constraints: [],
    unknowns: assessment.missingSlots,
    readiness: assessment.readiness,
    missingSlots: assessment.missingSlots,
    reason: assessment.reason,
    responseMode: "plan",
  };
}

export type InboxClarificationResult = {
  translation: InboxClarificationTranslation;
  summary: InboxClarificationSummary;
  /** readiness 不是 ready 时，翻译 Agent 额外给的一个补全问题；否则为 null。 */
  question?: InboxClarificationDimension | null;
};

function buildFallbackSummaryFromTranslation(
  content: string,
  translation: InboxClarificationTranslation,
): InboxClarificationSummary {
  const intent =
    translation.normalizedIntent || translation.literalMeaning || content;
  return {
    originalIdea: content,
    realProblem: intent,
    confirmedFacts: translation.confirmedFacts,
    interpretations: translation.interpretations,
    valueJudgments: translation.valueJudgments,
    goals: translation.goals,
    unverifiedAssumptions: translation.unknowns,
    keyVariable: translation.unknowns[0] ?? "",
    workingAssumption: intent,
    ifWrongThen:
      "如果执行后发现方向不对，先重做第一条任务，不要继续堆后续任务。",
  };
}

function buildClarificationQuestionFallback(
  content: string,
): InboxClarificationDimension {
  const assessment = assessIdeaReadiness(content);
  const options = assessment.completionOptions.length
    ? assessment.completionOptions
    : ["一件工作或学习上的事", "一段关系或一次沟通", "生活安排或习惯"];
  return {
    key: assessment.readiness === "needs_meaning" ? "meaning" : "context",
    question: assessment.completionPrompt || "先补一句：这件事具体指什么？",
    options: options.slice(0, 4),
  };
}

function normalizeClarificationQuestion(
  value: unknown,
  fallback: InboxClarificationDimension,
): InboxClarificationDimension {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const question =
    typeof raw.question === "string" && raw.question.trim()
      ? raw.question.trim().slice(0, 120)
      : fallback.question;
  const options = Array.isArray(raw.options)
    ? raw.options
        .filter((o): o is string => typeof o === "string" && Boolean(o.trim()))
        .map((o) => o.trim().slice(0, 40))
        .slice(0, 4)
    : [];
  const key =
    typeof raw.key === "string" && raw.key.trim()
      ? raw.key.trim().slice(0, 40)
      : fallback.key;
  return {
    key,
    question,
    options: options.length >= 2 ? options : fallback.options,
    ...(raw.multi === true ? { multi: true } : {}),
  };
}

function buildFrameFromTranslation(
  translation: InboxClarificationTranslation,
  summary: InboxClarificationSummary,
  content: string,
): InboxClarificationFrame {
  const assessment = assessIdeaReadiness(content);
  const unknowns = translation.unknowns;
  const workingAssumption =
    summary.workingAssumption || translation.normalizedIntent;
  return {
    surfaceRequest: translation.literalMeaning || content,
    coreNeedHypothesis: translation.normalizedIntent || summary.realProblem,
    decisionFork: unknowns.length
      ? `先按“${workingAssumption}”推进，还是先确认“${unknowns[0]}”`
      : `直接按“${workingAssumption}”推进`,
    decisiveUnknown: unknowns[0] ?? "",
    whyItChangesPlan: unknowns.length
      ? "这个未知点会改变第一条任务、完成标准和最适合的做法。"
      : "没有会影响开工的未知点，按默认判断往下走。",
    workingAssumptions: workingAssumption ? [workingAssumption] : [],
    methodOptions: [],
    readiness: translation.readiness,
    missingSlots: translation.missingSlots.length
      ? translation.missingSlots
      : assessment.missingSlots,
    completionPrompt: assessment.completionPrompt,
    completionOptions: assessment.completionOptions,
  };
}

async function generateClarificationTranslation(input: {
  content: string;
  history: InboxClarificationHistoryItem[];
  translation?: InboxClarificationTranslation | null;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  projectContext?: InboxProjectContext[];
  memorySummary?: string | null;
  evidence?: string[];
  decisionMemory?: string[];
}): Promise<InboxClarificationResult> {
  const assessment = assessIdeaReadiness(input.content);
  const fallbackTranslation = buildFallbackClarificationTranslation(
    input.content,
    input.history,
    assessment,
  );
  const fallbackSummary = buildFallbackSummaryFromTranslation(
    input.content,
    fallbackTranslation,
  );
  const text = await callModel(
    CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
    buildClarificationTranslationUserPayload({
      originalIdea: input.content,
      contextSummary: input.memorySummary ?? null,
      contextEvidence: input.evidence ?? [],
      projectContext: input.projectContext ?? [],
      decisionMemory: input.decisionMemory ?? [],
      previousTranslation: input.translation ?? null,
      inputAssessmentHint: assessment,
      history: input.history.map((item) => ({
        key: item.key,
        question: item.question,
        answers: item.answer,
        reflection: item.reflection ?? null,
      })),
    }),
    input.apiKey,
    input.model,
    input.baseUrl,
    0.1,
    {
      maxTokens: 1400,
      timeoutMs: 15_000,
      totalBudgetMs: 15_000,
      maxAttempts: 1,
      reasoningEffort: "none",
      qualityRules: "",
    },
  );
  const fallbackQuestion =
    fallbackTranslation.readiness === "ready"
      ? null
      : buildClarificationQuestionFallback(input.content);
  if (!text) {
    return {
      translation: fallbackTranslation,
      summary: fallbackSummary,
      question: fallbackQuestion,
    };
  }
  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Record<string, unknown>;
    const translated =
      raw.translation && typeof raw.translation === "object"
        ? raw.translation
        : raw;
    const translation = normalizeClarificationTranslation(
      translated,
      fallbackTranslation,
    );
    const summary = normalizeClarificationSummary(
      raw.summary,
      buildFallbackSummaryFromTranslation(input.content, translation),
    );
    // 问不问由模型决定：它会考虑 readiness，也会考虑用户明说但没定的取舍。
    // 模型没给问题、且本地判断信息不够时，才用本地兜底问题。
    const question =
      raw.question && typeof raw.question === "object"
        ? normalizeClarificationQuestion(
            raw.question,
            buildClarificationQuestionFallback(input.content),
          )
        : translation.readiness === "ready"
          ? null
          : buildClarificationQuestionFallback(input.content);
    return { translation, summary, question };
  } catch {
    return {
      translation: fallbackTranslation,
      summary: fallbackSummary,
      question: fallbackQuestion,
    };
  }
}

/**
 * 链路第 1 段的公开入口：任何输入都先翻译成结构化语义 + 默认判断。
 * 首页澄清、计划前兜底、以及没有历史 translation 的调用都走这里。
 */
export async function translateIdea(input: {
  content: string;
  history?: InboxClarificationHistoryItem[];
  translation?: InboxClarificationTranslation | null;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  projectContext?: InboxProjectContext[];
  memorySummary?: string | null;
  evidence?: string[];
  decisionMemory?: string[];
}): Promise<InboxClarificationResult> {
  return generateClarificationTranslation({
    content: input.content,
    history: input.history ?? [],
    translation: input.translation ?? null,
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
    projectContext: input.projectContext,
    memorySummary: input.memorySummary,
    evidence: input.evidence,
    decisionMemory: input.decisionMemory,
  });
}


function buildClarificationSession(
  frame: InboxClarificationFrame | null,
  question: InboxClarificationDimension | null,
  summary: InboxClarificationSummary | null,
  done: boolean,
): DecisionSession {
  return buildDecisionSession({
    stage: done ? "decide" : "clarify",
    kind: done ? "plan" : "clarify",
    coreNeedHypothesis: frame?.coreNeedHypothesis,
    recommendation: summary?.realProblem ?? frame?.coreNeedHypothesis,
    nextAction: done
      ? summary?.workingAssumption ?? ""
      : question?.question ?? "",
    fallback: summary?.ifWrongThen ?? "",
    confidence: frame?.readiness === "ready" ? 0.72 : 0.5,
  });
}

function normalizeClarificationSummary(
  value: unknown,
  fallback: InboxClarificationSummary,
): InboxClarificationSummary {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const stringValue = (item: unknown, fallbackValue: string) =>
    typeof item === "string" && item.trim()
      ? item.trim().slice(0, 500)
      : fallbackValue;
  const stringList = (item: unknown, fallbackValue: string[]) =>
    Array.isArray(item)
      ? item
          .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
          .slice(0, 5)
          .map((entry) => entry.trim().slice(0, 300))
      : fallbackValue;
  const optionalString = (item: unknown) =>
    typeof item === "string" && item.trim()
      ? item.trim().slice(0, 500)
      : undefined;
  return {
    originalIdea: stringValue(raw.originalIdea, fallback.originalIdea),
    realProblem: stringValue(raw.realProblem, fallback.realProblem),
    confirmedFacts: stringList(raw.confirmedFacts, fallback.confirmedFacts),
    interpretations: stringList(raw.interpretations, fallback.interpretations),
    valueJudgments: stringList(raw.valueJudgments, fallback.valueJudgments),
    goals: stringList(raw.goals, fallback.goals),
    unverifiedAssumptions: stringList(raw.unverifiedAssumptions, fallback.unverifiedAssumptions),
    keyVariable: stringValue(raw.keyVariable, fallback.keyVariable),
    newQuestion: optionalString(raw.newQuestion) ?? fallback.newQuestion,
    workingAssumption:
      optionalString(raw.workingAssumption) ?? fallback.workingAssumption,
    ifWrongThen: optionalString(raw.ifWrongThen) ?? fallback.ifWrongThen,
  };
}




export async function generateSocraticClarification(input: {
  content: string;
  history: InboxClarificationHistoryItem[];
  frame?: InboxClarificationFrame | null;
  translation?: InboxClarificationTranslation | null;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  projectContext?: InboxProjectContext[];
  memorySummary?: string;
  evidence?: string[];
  decisionMemory?: string[];
  maxQuestions?: number;
  onDelta?: (delta: string) => void;
}): Promise<InboxClarification> {
  const maxQuestions = Math.min(Math.max(input.maxQuestions ?? 3, 1), 5);
  // 链路第 1 段：翻译 Agent 一次产出结构化语义 + 默认判断。
  // 中间那段“提问/收敛”模型已经空转（autoConverge），主干不再调用它。
  const { translation, summary, question } =
    await generateClarificationTranslation({
    content: input.content,
    history: input.history,
    translation: input.translation,
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
    projectContext: input.projectContext,
    memorySummary: input.memorySummary,
    evidence: input.evidence,
    decisionMemory: input.decisionMemory,
  });
  const frame = buildFrameFromTranslation(translation, summary, input.content);
  // readiness 不是 ready 就继续补信息，直到 ready 或问到上限；每轮只问一条，
  // 问过的不复问、接得住上一轮回答。到上限无论 readiness 如何都往下走。
  const answeredCount = input.history.filter(
    (item) => item.answer.length > 0,
  ).length;
  // 问不问、问什么，全在第 1 段翻译 Agent 里决定——它才是那个知道"缺什么"的 agent。
  // 生成 Agent 只在澄清收口之后才开工，不参与提问（不拿不完整的输入去跑生成）。
  const finalQuestion = question;

  if (finalQuestion && answeredCount < maxQuestions) {
    const historyItem: InboxClarificationHistoryItem = {
      ...finalQuestion,
      answer: [],
      reflection: null,
    };
    return {
      dimensions: clarificationHistoryToDimensions(input.history),
      supplementPlaceholder: "",
      mode: "socratic",
      status: "asking",
      askedCount: answeredCount,
      maxQuestions,
      history: [...input.history, historyItem],
      summary: null,
      translation,
      frame,
      session: buildClarificationSession(frame, finalQuestion, null, false),
    };
  }
  // 澄清收口 → 先定模式，再交给第 2 段。第 2、3 段只承接这个结论。
  const workMode = await judgeWorkMode({
    content: input.content,
    translation,
    summary,
    history: input.history,
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
  });

  return {
    dimensions: clarificationHistoryToDimensions(input.history),
    supplementPlaceholder: "",
    mode: "socratic",
    status: "done",
    workMode,
    askedCount: input.history.length,
    maxQuestions,
    history: input.history,
    summary,
    translation,
    frame,
    session: buildClarificationSession(frame, null, summary, true),
  };
}

/**
 * 澄清收口之后、生成之前的模式判断。
 *
 * 位置是用户明确要求的：模式必须在这里定下来，第 2 段规划执行和第 3 段收敛排版
 * 只承接结论，不再自己判。判断器沿用 MODE_JUDGMENT_SYSTEM_PROMPT（与 eval:mode 共用）。
 */
export async function judgeWorkMode(input: {
  content: string;
  translation?: InboxClarificationTranslation | null;
  summary?: InboxClarificationSummary | null;
  history?: InboxClarificationHistoryItem[];
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): Promise<ProjectMode> {
  const answers = (input.history ?? [])
    .flatMap((item) => item.answer)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const clarified = [
    input.translation?.normalizedIntent,
    input.summary?.realProblem,
    ...answers,
  ]
    .filter((item): item is string => Boolean(item && String(item).trim()))
    .join("；");
  const text = await callModel(
    MODE_JUDGMENT_SYSTEM_PROMPT,
    buildModeJudgmentUserPayload([
      {
        id: "current",
        input: input.content,
        ...(clarified ? { clarified } : {}),
      },
    ]),
    input.apiKey,
    input.model,
    input.baseUrl,
    0.1,
    {
      maxTokens: 700,
      timeoutMs: 12_000,
      totalBudgetMs: 12_000,
      maxAttempts: 1,
      reasoningEffort: "none",
      qualityRules: "",
    },
  );
  // callModel 失败时 text 为空，pickModeFromJudgment 会落 normal。
  // 落 normal 等于「做完一次就结束」，会把长期 / 探索目标压小；
  // 所以模型没给出结论时，再用本地规则兜一层。
  if (!text || !text.trim()) {
    return heuristicProjectMode(
      [clarified, input.content].filter(Boolean).join("；"),
      false,
    );
  }
  return pickModeFromJudgment(text);
}

export async function planInbox(
  content: string,
  projectNames: string[],
  apiKey?: string,
  model?: string,
  baseUrl?: string,
  direction?: string,
  supplement?: string,
  projectContext?: InboxProjectContext[],
  memorySummary?: string,
  dimensionChoices?: string[],
  evidence?: string[],
  maxTasks?: number,
  onDelta?: (delta: string) => void,
  clarificationHistory?: InboxClarificationHistoryItem[],
  clarificationSummary?: InboxClarificationSummary | null,
  clarificationFrame?: InboxClarificationFrame | null,
  clarificationSession?: DecisionSession | null,
  decisionMemory?: string[],
  workMode?: string,
): Promise<InboxPlan>  {
  const clarifiedContent = [content, direction, supplement]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n");
  const fallback = heuristicPlan(clarifiedContent, projectNames, workMode);

  const text = await callModel(
    PLAN_SYSTEM_PROMPT,
    buildPlanUserPayload({
      currentDate: toDateInputValue(new Date()),
      content: clarifiedContent,
      projectNames,
      projects: projectContext ?? [],
      memorySummary: memorySummary ?? null,
      dimensionChoices: dimensionChoices ?? [],
      clarificationHistory: (clarificationHistory ?? []).map((item) => ({
        key: item.key,
        question: item.question,
        answers: item.answer,
        reflection: item.reflection ?? null,
      })),
      clarificationFrame: clarificationFrame ?? null,
      clarificationSession: clarificationSession ?? null,
      clarificationSummary: clarificationSummary ?? null,
      decisionMemory: decisionMemory ?? [],
      contextEvidence: evidence ?? [],
      maxTasks: maxTasks ?? null,
      workMode: workMode ?? null,
    }),
    apiKey,
    model,
    baseUrl,
    0.65,
    { onDelta, maxTokens: 2800, reasoningEffort: "none" },
  );

  if (!text) return { ...fallback, source: "heuristic_fallback" };

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<InboxPlan>;
    const action = safePlanAction(raw.action);
    const projectName =
      typeof raw.projectName === "string" && raw.projectName.trim()
        ? raw.projectName.trim().slice(0, 120)
        : fallback.projectName;

    const taskDisposition =
      raw.taskDisposition === "attach" || raw.taskDisposition === "new_tasks"
        ? raw.taskDisposition
        : action === "create_project"
          ? "new_tasks"
          : "attach";
    const taskLimit = Math.min(
      maxTasks ?? MAX_AI_TASKS_PER_PLAN,
      MAX_AI_TASKS_PER_PLAN,
    );
    const rawTasks = Array.isArray(raw.tasks)
      ? raw.tasks.map(safePlanTask)
      : fallback.tasks;
    const tasks = collapsePlannedTasks(rawTasks, taskLimit);
    const firstTask = tasks[0];
    const session = firstTask
      ? buildDecisionSession({
          stage: "execute",
          kind: routeDecisionKind({ mode: "plan" }),
          coreNeedHypothesis:
            clarificationSession?.coreNeedHypothesis ??
            clarificationFrame?.coreNeedHypothesis ??
            (typeof raw.projectObjective === "string"
              ? raw.projectObjective
              : fallback.projectObjective),
          recommendation: firstTask.recommendation,
          nextAction: firstTask.executionSteps[0] ?? firstTask.recommendation,
          fallback: firstTask.fallback,
          confidence: firstTask.recommendation ? 0.84 : 0.55,
        })
      : null;

    return {
      action,
      taskDisposition,
      // 用户显式选了就听用户的；智能模式才采用模型判断，模型没给就用本地启发式兜底。
      mode: isProjectMode(workMode)
        ? workMode
        : normalizeProjectMode(
            raw.mode ??
              heuristicProjectMode(clarifiedContent, action !== "single_task"),
          ),
      projectName,
      projectObjective:
        typeof raw.projectObjective === "string" && raw.projectObjective.trim()
          ? raw.projectObjective.trim().slice(0, 500)
          : fallback.projectObjective,
      projectMilestone:
        typeof raw.projectMilestone === "string" && raw.projectMilestone.trim()
          ? raw.projectMilestone.trim().slice(0, 200)
          : fallback.projectMilestone,
      tasks: tasks.length ? tasks : fallback.tasks,
      reason:
        typeof raw.reason === "string" && raw.reason.trim()
          ? raw.reason.trim()
          : fallback.reason,
      session,
      source: "model",
    };
  } catch (error) {
    console.warn(
      "[ai] plan parse failed",
      error instanceof Error ? error.message : error,
      text.slice(0, 500),
    );
    return { ...fallback, source: "heuristic_fallback" };
  }
}

export async function generateFirstRunPlan(
  content: string,
): Promise<FirstRunPlanResult> {
  const fallback: FirstRunPlanResult = {
    ...heuristicFirstRun(content),
    usedFallback: true,
  };
  try {
    // 首次引导的“想法 → 执行路径”与主链共用同一套三段 Agent：
    // 翻译 → 生成内容 → 收敛，不再单独维护一份一次性提示词。
    const { planNormalWithAgents } = await import("@/lib/agent-plan/normal");
    const outcome = await planNormalWithAgents({ content, maxTasks: 3 });
    if (outcome.status !== "ok") return fallback;
    const plan = outcome.plan;
    const task = plan.tasks[0];
    if (!task) return fallback;
    return {
      projectName: (plan.projectName ?? fallback.projectName).slice(0, 60),
      objective: (plan.projectObjective ?? fallback.objective).slice(0, 500),
      milestone: (plan.projectMilestone ?? fallback.milestone).slice(0, 200),
      taskTitle: task.title.slice(0, 200),
      taskShortTitle: task.shortTitle,
      taskExecutionMode: task.executionMode,
      taskDoneWhen: task.doneWhen.slice(0, 200),
      taskMethodHint: task.methodHint.slice(0, 240),
      taskRecommendation: (task.recommendation || task.methodHint).slice(0, 400),
      taskExecutionSteps: task.executionSteps.slice(0, 8),
      taskFallback: (task.fallback ?? "").slice(0, 240),
      taskMaxTurns: task.maxTurns,
      taskToolPolicy: task.toolPolicy,
      usedFallback: false,
    };
  } catch {
    return fallback;
  }
}
export async function generateTaskEditSuggestion(input: {
  title: string;
  shortTitle?: string | null;
  notes?: string | null;
  priority?: string;
  scheduledDate?: string | null;
  dueDate?: string | null;
  focusDate?: string | null;
  idea: string;
}, memorySummary?: string, evidence?: string[], decisionMemory?: string[]): Promise<TaskEditSuggestion> {
  const decisionKind = routeDecisionKind({ message: input.idea, mode: "coach" });
  const fallback: TaskEditSuggestion = {
    title: input.idea.trim() || input.title,
    shortTitle: normalizeShortTitle(input.shortTitle, input.title),
    notes: input.notes ?? null,
    priority: safePriority(input.priority),
    reason: "本地规则：把你的想法作为新的任务标题，保留原备注。",
    decision: buildDecisionSession({
      kind: decisionKind,
      coreNeedHypothesis: input.idea,
      recommendation: input.idea.trim() || input.title,
      nextAction: input.idea.trim() || input.title,
      explanation: (decisionMemory ?? []).slice(0, 2).join("；"),
    }),
  };

  const text = await callModel(
    `你是走走里的任务推进伙伴，不是标准修改助手。用户会输入一个修改想法，以及当前任务字段。你需要理解用户真正想调整什么：可能是负担太重、方向变了、没时间或状态不佳。本次决策类型：${decisionKind}；如果是 recommend / compare，要把具体推荐或比较结论写进 notes/reason；如果是 plan，给出可执行路径；如果是 coach，先解除当前阻力。只返回 JSON，不要 Markdown。格式：{"title":"新标题","shortTitle":"精简标题","notes":"备注","priority":"low|medium|high|urgent","scheduledDate":"YYYY-MM-DD或null","dueDate":"YYYY-MM-DD或null","focusDate":"YYYY-MM-DD或null","reason":"中文说明为什么这样改"}。shortTitle 要理解任务的动作、对象和场景后重新概括，4-12 个字，不能截取 title 开头；只返回需要改的字段，reason 必须返回，并且要引用用户原话中的真实理由。如果用户想缓一缓或缩小范围，优先降低负担、简化任务，不要强行排期。`,
    JSON.stringify({
      ...input,
      memorySummary: memorySummary ?? null,
      decisionMemory: decisionMemory ?? [],
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.55,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<TaskEditSuggestion>;
    return {
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 200)
          : fallback.title,
      shortTitle: normalizeShortTitle(
        raw.shortTitle,
        raw.title?.trim() || input.title,
      ),
      notes:
        typeof raw.notes === "string"
          ? raw.notes.trim()
          : fallback.notes,
      priority: safePriority(raw.priority),
      scheduledDate:
        typeof raw.scheduledDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.scheduledDate)
          ? raw.scheduledDate
          : fallback.scheduledDate,
      dueDate:
        typeof raw.dueDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)
          ? raw.dueDate
          : fallback.dueDate,
      focusDate:
        typeof raw.focusDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.focusDate)
          ? raw.focusDate
          : fallback.focusDate,
      reason:
        typeof raw.reason === "string" && raw.reason.trim()
          ? raw.reason.trim()
          : fallback.reason,
      decision: buildDecisionSession({
        kind: decisionKind,
        coreNeedHypothesis: input.idea,
        recommendation:
          typeof raw.title === "string" && raw.title.trim()
            ? raw.title.trim()
            : fallback.title,
        nextAction:
          typeof raw.title === "string" && raw.title.trim()
            ? raw.title.trim()
            : fallback.title,
        explanation: (decisionMemory ?? []).slice(0, 2).join("；"),
      }),
    };
  } catch {
    return fallback;
  }
}

export async function generateProjectEditSuggestion(input: {
  name: string;
  objective: string;
  currentMilestone?: string | null;
  status?: string;
  notes?: string | null;
  idea: string;
}, memorySummary?: string, evidence?: string[], decisionMemory?: string[]): Promise<ProjectEditSuggestion> {
  const decisionKind = routeDecisionKind({ message: input.idea, mode: "coach" });
  const fallback: ProjectEditSuggestion = {
    objective: input.idea.trim() || input.objective,
    notes: input.notes ?? null,
    reason: "本地规则：把你的想法作为新的项目目标，保留原备注。",
    decision: buildDecisionSession({
      kind: decisionKind,
      coreNeedHypothesis: input.idea,
      recommendation: input.idea.trim() || input.objective,
      nextAction: input.idea.trim() || input.objective,
      explanation: (decisionMemory ?? []).slice(0, 2).join("；"),
    }),
  };

  const text = await callModel(
    `你是走走里的项目推进伙伴，不是标准修改助手。用户会输入一个修改想法，以及当前项目字段。你需要理解这个项目对用户来说为什么重要、当前卡在哪，并返回最合理的修改建议。本次决策类型：${decisionKind}；如果是 recommend / compare，要给出具体推荐或比较结论；如果是 plan，给出阶段路径；如果是 coach，先解除当前阻力。只返回 JSON，不要 Markdown。格式：{"name":"项目名称","objective":"项目目标","currentMilestone":"当前里程碑","status":"active|paused|completed|archived","notes":"备注","reason":"中文说明为什么这样改"}。只返回需要改的字段，reason 必须返回，并且引用用户原话中的真实理由。如果用户提到暂停、缩小或换方向，优先让项目负担更轻，而不是增加新承诺。`,
    JSON.stringify({
      ...input,
      memorySummary: memorySummary ?? null,
      decisionMemory: decisionMemory ?? [],
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.55,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<ProjectEditSuggestion>;
    return {
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim().slice(0, 120)
          : undefined,
      objective:
        typeof raw.objective === "string" && raw.objective.trim()
          ? raw.objective.trim().slice(0, 500)
          : fallback.objective,
      currentMilestone:
        typeof raw.currentMilestone === "string"
          ? raw.currentMilestone.trim()
          : fallback.currentMilestone,
      status:
        typeof raw.status === "string" &&
        ["active", "paused", "completed", "archived"].includes(raw.status)
          ? raw.status
          : undefined,
      notes:
        typeof raw.notes === "string"
          ? raw.notes.trim()
          : fallback.notes,
      reason:
        typeof raw.reason === "string" && raw.reason.trim()
          ? raw.reason.trim()
          : fallback.reason,
      decision: buildDecisionSession({
        kind: decisionKind,
        coreNeedHypothesis: input.idea,
        recommendation:
          typeof raw.objective === "string" && raw.objective.trim()
            ? raw.objective.trim()
            : fallback.objective,
        nextAction:
          typeof raw.currentMilestone === "string" && raw.currentMilestone.trim()
            ? raw.currentMilestone.trim()
            : fallback.currentMilestone ?? fallback.objective,
        explanation: (decisionMemory ?? []).slice(0, 2).join("；"),
      }),
    };
  } catch {
    return fallback;
  }
}

export async function generateTaskShortTitle(input: {
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
}): Promise<TaskShortTitleSuggestion> {
  const fallback = {
    shortTitle: normalizeShortTitle(null, input.title),
  };
  const text = await callModel(
    `你是走走里的任务信息提炼助手。请理解任务的完整标题、备注、所属项目和当前状态，识别这个任务真正要处理的动作、对象与场景，再生成一个列表展示用的语义标题。
要求：
- shortTitle 为 4-12 个字，像人给任务贴的简洁标签。
- 不能直接截取标题开头，不能只复述时间和分钟数。
- 必须保留任务最关键的对象或差异，例如“验证国内替代方案”“注册 Atypica 跑通流程”“整理首批用户反馈”。
- 不要使用“推进任务”“执行第一步”“完成计划”这类空泛表达。
- 只返回 JSON，不要 Markdown。格式：{"shortTitle":""}`,
    JSON.stringify(input),
    undefined,
    undefined,
    undefined,
    0.4,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<TaskShortTitleSuggestion>;
    return {
      shortTitle: normalizeShortTitle(raw.shortTitle, input.title),
    };
  } catch {
    return fallback;
  }
}

export async function generateTaskCoachAdvice(input: {
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  message: string;
  projectMode?: string | null;
  executionMode?: string | null;
  doneWhen?: string | null;
  methodHint?: string | null;
}, memorySummary?: string, evidence?: string[]): Promise<TaskCoachAdvice> {
  const fallback = buildLocalTaskCoachAdvice(input);
  const decisionKind = routeDecisionKind({
    message: input.message,
    mode: "coach",
  });

  const text = await callModel(
    `你是走走里的任务伙伴，不是标准助手。用户会给你一个任务标题和一段很随意的想法。你要像熟悉他的朋友一样，先接住他的话，再写一张便利贴。
本次决策类型：${decisionKind}。如果是 recommend 或 compare，不要只给执行步骤，要在 encouragement、steps 和 nextStep 里直接给出具体推荐或比较结论；如果是 plan，给出可执行路径；如果是 coach，帮他排除当前阻力。
硬性要求：
- 必须回应用户原话和任务标题，不能只讲通用道理。
- 禁止使用“卡住很正常”“保持耐心”“一步一步来”“你可以尝试”这类模板句。
- 禁止每次使用同一套结构；根据用户原话里的具体词改变标题、鼓励语、步骤和下一步。
- 把用户原话中的细节直接带进内容，不要只替换任务名。
- 先判断用户更需要澄清、取舍、找反馈、降低阻力还是直接动手，不必每次都拆成“小步”。
- 步骤要具体到马上能做；nextStep 是接下来最该动手做的真实动作，指向一个能交出去的结果，不要总以“先”字开头，也不要固定写“最小一步”，更不要把动作压成“花几分钟随便做点”。
- nextStep 不能是“思考一下”“整理思路”这类抽象指令。
- steps 是执行卡片上的行动块，可以带序号，但不是把任务拆成空洞步骤。每块要是一段完整行动：做什么、用什么工具或方法、最后拿到什么；能合并就合并，不要为了凑结构拆碎。
- 大多数任务 2-4 块就够；只有步骤之间有明显前后依赖或各自有独立产出时才多分，不要为了完整感把一件事拆成很多块。
- steps 文本里不要自己写“1.”“2.”“第一步”“第二步”，序号由界面统一显示，你只写每块的行动内容。
- 每块写到能直接照做就停，不要展开成教程；需要代码、提示词或文案时可以直接给出，其他说明尽量压短。
- 按项目模式调整详略：普通模式给完整处理方法和完成标志；长期模式只说这一轮怎么推进当前阶段、做完后从哪里继续；探索模式说这次练什么或试什么、记录什么反馈，不谈完成度。
- 工具自然融进行动里：需要外部工具就写清打开什么、输入什么、拿到什么；不需要就写清怎么做和得到什么。不要单独列工具清单，也不要为了显得具体硬塞。
- 需要判断时写清怎么算做到；不需要判断就不要硬加验收标准。AI 现在就能产出的内容（文案、比较、改法、清单、判断）要直接写出来，不要让用户再问一遍 AI。
- 涉及日期、年份或有效期时，必须基于输入里的 currentDate，不能凭记忆写错年份。
- 工具名和网址必须准确；不确定网址就不要写，只写工具名和搜索关键词，避免编造链接。
- 只返回一个 JSON 对象，不要把多个 JSON 对象拼在一起，也不要重复输出同一步。
- 不要用“你只需要”“你应该”这类说教句式。
- 语气像人写的，不像 AI 生成的。
- 只返回 JSON，不要 Markdown。
格式：{"title":"便利贴标题","encouragement":"一句鼓励","steps":["可以带序号，也可以不写序号；每块是一段完整行动"],"nextStep":"接下来可做的具体动作"}
示例输入：任务“整理作品集”，想法“我不知道该放什么”
示例输出：{"title":"先按目标岗位反推作品顺序","encouragement":"你不知道放什么，是因为还没定作品集要给谁看。","steps":["把目标岗位的招聘要求和现有简历贴给 AI，让它列出对方最在意的 3 类能力","从现有作品里挑出分别证明这 3 类能力的 3 个项目","把项目按“问题—做法—结果”改写成三句话，先放进作品集"],"nextStep":"把目标岗位链接和简历贴给 AI，让它反推作品顺序"}`,
    JSON.stringify({
      ...input,
      currentDate: toDateInputValue(new Date()),
      decisionKind,
      memorySummary: memorySummary ?? null,
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.75,
    { maxTokens: 4000, reasoningEffort: "none" },
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<TaskCoachAdvice>;
    const steps = Array.isArray(raw.steps)
      ? raw.steps
          .filter(
            (step): step is string =>
              typeof step === "string" && step.trim().length > 0,
          )
          .map((step) =>
            step
              .replace(
                /^\s*(?:\d{1,2}\s*[.、)）]|第[一二三四五六七八九十]+步[:：]?)\s*/,
                "",
              )
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 8)
      : [];

    return {
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 80)
          : fallback.title,
      encouragement:
        typeof raw.encouragement === "string" && raw.encouragement.trim()
          ? raw.encouragement.trim().slice(0, 200)
          : fallback.encouragement,
      steps: steps.length ? steps : fallback.steps,
      nextStep:
        typeof raw.nextStep === "string" && raw.nextStep.trim()
          ? raw.nextStep.trim().slice(0, 200)
          : fallback.nextStep,
    };
  } catch {
    return fallback;
  }
}

function buildLocalTaskCoachAdvice(input: {
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  message: string;
}): TaskCoachAdvice {
  const message = input.message.trim();
  const title = input.title;
  const short =
    message.length > 36 ? `${message.slice(0, 36)}…` : message;
  const lower = message.toLowerCase();
  const seed = [...`${title}:${message}`].reduce(
    (hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0,
    0,
  );

  if (/没头绪|不知道|怎么开始|不会开始|完全不懂|没想法/.test(lower)) {
    return [
      {
        title: `${title} 的启动版`,
        encouragement: `你说“${short}”，那就先从这句话里找一个能做的动词。`,
        steps: [
          `把“${title}”的第一步写成“打开、写下、列出或试做”这类动作。`,
          `从“${short}”里挑一个你最关心的词，作为这次目标。`,
          `先做起来，做到有结果再停。`,
        ],
        nextStep: `写出“${title}”今天要交付的具体结果。`,
      },
      {
        title: `${title} 的第一次动手`,
        encouragement: `“${short}”还没有变成动作，所以你觉得不知道怎么开始。`,
        steps: [
          `把“${title}”变成今天能做完、并且有产出的结果。`,
          `把“${short}”转成一句能问自己的话。`,
          `先回答那句话，再决定下一步。`,
        ],
        nextStep: `回答“${short}”里最让你没底的那句话。`,
      },
      {
        title: `${title} 的第一次推进`,
        encouragement: `“${title}”对你不是没价值，是第一步还没被定义清楚。`,
        steps: [
          `先明确“${title}”今天要做到哪一步。`,
          `从“${short}”里找出最容易先做到的部分。`,
          `今天把最先能落地的那一步做出来。`,
        ],
        nextStep: `完成“${title}”里最容易先做到的部分。`,
      },
    ][seed % 3];
  }

  if (/卡住|困难|问题|不会|不懂|卡在|做不下去/.test(lower)) {
    return [
      {
        title: `${title} 的卡点`,
        encouragement: `你说“${short}”，那我们就只处理这一句里最卡的部分。`,
        steps: [
          `把“${title}”里最卡的部分单独摘出来。`,
          `写下你试过什么、卡在什么现象上。`,
          `先只解决这个卡点。`,
        ],
        nextStep: `写下“${title}”里最卡的一句话。`,
      },
      {
        title: `${title} 的诊断`,
        encouragement: `卡住通常不是不会，而是没有把问题说清楚。`,
        steps: [
          `把“${short}”改写成一句“我卡在……，因为……”。`,
          `看看这句话里，哪个词是真正难点。`,
          `只针对那个难点找一个小动作。`,
        ],
        nextStep: `把“${short}”改写成“我卡在…，因为…”。`,
      },
      {
        title: `${title} 的下一步`,
        encouragement: `你已经走到具体问题这一步，剩下的不是重新开始，而是把能做的做出来。`,
        steps: [
          `找出“${title}”里你现在能直接动手做的部分。`,
          `先做能控制的，暂时放下不能控制的。`,
          `把下一步写成一句明确的动作。`,
        ],
        nextStep: `把“${title}”里能控制的那一步先做出来。`,
      },
    ][seed % 3];
  }

  if (/没时间|时间不够|来不及|太忙/.test(lower)) {
    return [
      {
        title: `${title} 的碎片版`,
        encouragement: `你说“${short}”，那就先做能立刻动手、又能出结果的那部分。`,
        steps: [
          `把“${title}”拆成今天能做完和需要更多时间两个版本。`,
          `今天先把能做完的那版做出来。`,
          `做完后把剩余部分标记为明天继续。`,
        ],
        nextStep: `做出“${title}”今天这一版。`,
      },
      {
        title: `${title} 的低负担版`,
        encouragement: `没时间通常不是真的没有，而是这个任务在你心里被放大了。`,
        steps: [
          `把“${title}”定成今天真正能交付的一个结果。`,
          `先做最不需要准备材料的那一步。`,
          `做完后允许自己停。`,
        ],
        nextStep: `把“${title}”里最不依赖额外准备的一步做出来。`,
      },
      {
        title: `${title} 的起步动作`,
        encouragement: `不用等有空，先动手把“${title}”做出一版。`,
        steps: [
          `挑出“${title}”里最先能动手做的那一步。`,
          `先动手做起来，不用等准备齐全。`,
          `做到有结果为止。`,
        ],
        nextStep: `今天把“${title}”做出第一个结果。`,
      },
    ][seed % 3];
  }

  if (/太多|乱|优先级|选择|不知道先做|哪个/.test(lower)) {
    return [
      {
        title: `${title} 的取舍`,
        encouragement: `“${short}”听起来不是一件事，而是好几件事叠在一起。`,
        steps: [
          `把“${title}”拆成“现在必须做、可以缓、可以不做”三堆。`,
          `从“必须做”里挑一件。`,
          `其他暂时不看。`,
        ],
        nextStep: `从“${title}”里挑一件现在必须做的。`,
      },
      {
        title: `${title} 的排序`,
        encouragement: `选择太多的时候，第一步不是做，而是删。`,
        steps: [
          `把“${title}”相关的所有念头列出来。`,
          `删掉现在不重要的。`,
          `剩下的只选一件推进。`,
        ],
        nextStep: `把“${title}”相关的念头删到只剩一件。`,
      },
      {
        title: `${title} 的唯一重点`,
        encouragement: `“${short}”让你乱，是因为没有唯一重点。`,
        steps: [
          `写下“${title}”如果只做一件事，会是什么。`,
          `把其他事标记为稍后。`,
          `先做那一件事。`,
        ],
        nextStep: `写下“${title}”唯一要做的一件事。`,
      },
    ][seed % 3];
  }

  return [
    {
      title: `${title} 的具体化`,
      encouragement: `你说“${short}”，下一步不是马上做，而是把它说具体。`,
      steps: [
        `把“${title}”写成具体结果。`,
        `从“${short}”里挑一个能验证的词。`,
        `先把能验证结果的那一步做出来。`,
      ],
      nextStep: `写出“${title}”的具体结果。`,
    },
    {
      title: `${title} 的下一步`,
      encouragement: `关于“${title}”，你已经有关键想法了，现在只需要把它变成动作。`,
      steps: [
        `把“${title}”落到今天能真正做出的一个结果。`,
        `把“${short}”里最想解决的部分放进去。`,
        `从不需要别人帮忙的那一项开始。`,
      ],
      nextStep: `做出“${title}”今天该交付的第一个结果。`,
    },
    {
      title: `${title} 的推进点`,
      encouragement: `“${short}”就是这次推进的入口，不用再重新想方向。`,
      steps: [
        `围绕“${short}”直接动手做。`,
        `先动手做起来。`,
        `把结果或卡点写下来。`,
      ],
      nextStep: `围绕“${short}”做出一个结果。`,
    },
  ][seed % 3];
}

function heuristicToday(tasks: FocusTask[]): TodaySuggestion[] {
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...tasks]
    .sort((a, b) => {
      const priorityDiff =
        (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      return (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0);
    })
    .slice(0, 3)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      projectName: task.projectName,
      priority: safePriority(task.priority),
      reason: task.dueDate
        ? "先处理临近截止的这件，避免拖延变成负担"
        : "今天先推进这一件，不用给自己太多压力",
      evidence: [],
      decision: buildDecisionSession({
        kind: "plan",
        coreNeedHypothesis: "从今天可推进的任务里选出一个最小但真实的前进动作",
        recommendation: task.title,
        nextAction: task.title,
        confidence: 0.6,
      }),
    }));
}

export async function suggestTodayFocus(
  tasks: FocusTask[],
  context?: {
    reviewSummary?: string;
    projects?: InboxProjectContext[];
  },
  memorySummary?: string,
  evidence?: string[],
  decisionMemory?: string[],
): Promise<TodaySuggestion[]> {
  const fallback = heuristicToday(tasks);
  if (!tasks.length) return fallback;

  const text = await callModel(
    "你是走走里的今日推进伙伴，不是标准排期助手。根据任务列表、最近复盘、用户反馈和 decisionMemory，选择今天最值得推进的 1-3 个任务。不要只按优先级和截止日期选；reason 要像朋友解释为什么今天做它，可以引用复盘、项目状态、最近完成/延期/取消结果或用户原话，不要总用“先做最小一步”这类说法。如果最近有任务延期、取消、计划被忽略或建议无效，优先降低密度、换方法或缩小范围，不要重复推荐同类高压任务。同一 batchId 是同一批计划拆出的任务，planOrder 是原定顺序；如果一件正好是另一件的前提，优先推它。只返回 JSON，不要 Markdown。格式：{\"suggestions\":[{\"title\":\"任务标题\",\"reason\":\"中文理由\"}]}。",
    JSON.stringify({
      tasks: tasks.map((task) => ({
        title: task.title,
        project: task.projectName,
        priority: task.priority,
        dueDate: task.dueDate?.toISOString().slice(0, 10),
        scheduledDate: task.scheduledDate?.toISOString().slice(0, 10),
        planOrder: task.planOrder ?? null,
        batchId: task.batchId ?? null,
      })),
      reviewSummary: context?.reviewSummary ?? null,
      projects: context?.projects ?? [],
      memorySummary: memorySummary ?? null,
      decisionMemory: decisionMemory ?? [],
      contextEvidence: evidence ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.65,
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as {
      suggestions?: Array<{ title?: string; reason?: string }>;
    };
    const suggestions = (raw.suggestions ?? [])
      .map((item): TodaySuggestion | null => {
        const task = tasks.find((candidate) => candidate.title === item.title);
        if (!task) return null;
    return {
      taskId: task.id,
      title: task.title,
      projectName: task.projectName,
      priority: safePriority(task.priority),
      reason: typeof item.reason === "string" ? item.reason : "AI 建议",
      evidence: evidence ?? [],
      decision: buildDecisionSession({
        kind: routeDecisionKind({
          message: `${task.title} ${item.reason ?? ""}`,
        }),
        coreNeedHypothesis:
          typeof item.reason === "string" ? item.reason : "今天优先推进这件任务",
        recommendation: task.title,
        nextAction: task.title,
        fallback: "",
        confidence: evidence?.length ? 0.82 : 0.65,
        explanation: (decisionMemory ?? []).slice(0, 2).join("；"),
      }),
    };
      })
      .filter((item): item is TodaySuggestion => item !== null)
      .slice(0, 3);

    return suggestions.length ? suggestions : fallback;
  } catch {
    return fallback;
  }
}

function heuristicReview(
  completed: Array<{ title: string; projectName: string | null }>,
  open: Array<{ title: string; projectName: string | null }>,
  planned: Array<{ title: string }>,
  projects: Array<{
    name: string;
    currentMilestone: string | null;
    taskCount: number;
    openTaskCount?: number;
  }>,
) {
  const projectSummary = projects.length
    ? `目前主要在推进${projects
        .slice(0, 3)
        .map(
          (project) =>
            `${project.name}${
              project.currentMilestone
                ? `（${project.currentMilestone}）`
                : ""
            }`,
        )
        .join("、")}。`
    : "";
  const completedText = completed.length
    ? completed
        .slice(0, 3)
        .map((task) => task.title)
        .join("、")
    : "暂无完成";
  const openText = open.length
    ? `还没完成的有 ${open
        .slice(0, 3)
        .map((task) => task.title)
        .join("、")}。`
    : "";

  return {
    summary: completed.length
      ? `今天完成了 ${completedText}。${openText}${projectSummary}`.trim()
      : `今天没有完成明确任务。${openText}${projectSummary}`.trim(),
    nextActions: open.length
      ? ""
      : projects.length
        ? `继续当前里程碑\n把「${projects[0].name}」下一件要拿到的具体结果写清并开始执行`
        : "",
  };
}

export async function generateReviewDraft(input: {
  completed: Array<{ title: string; projectName: string | null }>;
  open: Array<{
    id?: string;
    title: string;
    status?: string;
    projectName: string | null;
  }>;
  planned: Array<{ title: string }>;
  projects: Array<{
    name: string;
    currentMilestone: string | null;
    taskCount: number;
    openTaskCount?: number;
  }>;
}, evidence?: string[], onDelta?: (delta: string) => void, decisionMemory?: string[], scope?: { projectName: string; cadence: string | null }) {
  const fallback = heuristicReview(
    input.completed,
    input.open,
    input.planned,
    input.projects,
  );

  const reviewPrompt = `你是走走里的每日复盘伙伴。请根据当天完成的任务、今日计划、未完成任务、项目状态和 decisionMemory，写一段像用户自己留在纸上的复盘，不要写成汇报、心理分析或总结陈词。decisionMemory 里的完成、延期、取消、忽略计划和最近便利贴动作要用来判断下一步：重复延期的要缩小范围，被取消或无效的不要原样再来。summary 2-4 句话，先说具体做了什么，再说卡在哪里、下一步怎么判断；不要使用“今天真正推进的是”“不是……而是……”“意味着”“价值在于”等模板句，不要罗列任务数量。nextActions 只写 ${MAX_REVIEW_NEXT_ACTIONS} 条，也可以返回空字符串。已有未完成任务时不要再新建，只判断继续、调整还是替换；只有项目没有未完成任务时才给一条新任务。每条任务分两行：第一行是 6-16 个字的精简标题，第二行是 20-45 个字的具体说明。不要标序号、不要项目符号、不要竖线、不要写日期。只返回 JSON，不要 Markdown。格式：{\"summary\":\"总结\",\"nextActions\":\"精简标题\\n具体说明\"}。`;

  // 探索项目复盘：范围是"单个没有终点的项目"，问法要跟着换
  const scopedPrompt = scope
    ? reviewPrompt +
      `\n\n这次复盘的范围是**单个项目**：「${scope.projectName}」（当前节奏：${scope.cadence ?? "未设定"}）。用户在做一件没有终点的长期成长，所以：不要问"完成了吗"、不要算完成度、不要提"还剩多少"；要回看"这段时间练到哪了、卡在哪、下一条练什么"。nextActions 就是下一次要练的那一条。**只谈这一个项目：不要提到其他项目、其他项目的任务或其他事的进度**，即使 contextEvidence / decisionMemory 里出现了它们。`
    : reviewPrompt;

  const text = await callModel(
    scopedPrompt,
    JSON.stringify({
      ...input,
      scope: scope ?? null,
      contextEvidence: evidence ?? [],
      decisionMemory: decisionMemory ?? [],
    }),
    undefined,
    undefined,
    undefined,
    0.65,
    { onDelta, maxTokens: 1200 },
  );

  if (!text) return fallback;

  try {
    const raw = JSON.parse(extractJson(text) ?? "{}") as Partial<ReviewDraft>;
    if (
      typeof raw.summary === "string" &&
      typeof raw.nextActions === "string"
    ) {
      const nextActions = raw.nextActions
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_REVIEW_NEXT_ACTIONS * 2)
        .join("\n");
      return {
        summary: raw.summary.trim(),
        nextActions,
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}
