/**
 * AI 计划的质量检查。
 *
 * 分两层：
 * - 结构检查（有任务、有完成标准、字段取值合法）—— 机器能判死的东西
 * - 质量检查（空泛说法、模板句、shortTitle 是不是直接截断标题）—— 规则来自
 *   OUTPUT_QUALITY_RULES 和 AGENTS.md 的「任务尺度与输出质量」
 *
 * 放在 src/lib 下是为了能离线单测：评测脚本会花钱调模型，
 * 但检查逻辑本身必须每次 CI 都跑得到。
 */

/** 目标和里程碑里禁止出现的空泛说法 */
export const VAGUE_PHRASES = [
  "初版",
  "最小一步",
  "最小下一步",
  "先确认方向",
  "核心方向",
  "现实限制",
  "待整理",
];

/** 反复出现的模板开场与句式 */
export const TEMPLATE_PHRASES = [
  "我大概知道你真正看重什么了",
  "接下来不再套标准流程",
  "先做最小下一步",
  "今天真正推进的是",
];

/** 输出不该把动作绑死在某个记录工具上；载体应该是事情真正发生的地方 */
export const RECORD_TOOL_PHRASES = ["备忘录", "记事本", "便签"];

const RECORD_TOOL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/手机备忘录|iPhone\s*备忘录|苹果备忘录/g, "手机系统自带文稿工具"],
  [/备忘录|记事本/g, "系统自带文稿工具"],
  [/便签/g, "临时草稿"],
];

/** 用通用载体替换模型偶然写出的具体记录工具，避免红线内容进入计划和便利贴。 */
export function scrubRecordToolMentions<T>(value: T): T {
  if (typeof value === "string") {
    let text: string = value;
    for (const [pattern, replacement] of RECORD_TOOL_REPLACEMENTS) {
      text = text.replace(pattern, replacement);
    }
    return text as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubRecordToolMentions(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        scrubRecordToolMentions(item),
      ]),
    ) as unknown as T;
  }
  return value;
}

/** 没有给出真实做法的模板式方法建议 */
export const VAGUE_METHOD_PHRASES = [
  "按计划推进",
  "一步一步来",
  "先想清楚",
  "做好准备",
  "根据情况调整",
  "开始行动",
  "继续努力",
  "慢慢来",
];

/**
 * 把「先想清楚」这类认知动作当成要做的任务，等于把「做」推回「想」。
 * 走走的初心是「从想变为做」，所以这类任务不该通过质检。
 */
export const THINKING_ACTION_PHRASES = [
  "先想清楚",
  "先想明白",
  "先想一下",
  "先思考",
  "先梳理",
  "先理清",
  "先确认方向",
  "先明确方向",
  "想清楚再",
];

/** 看起来像问题，但没有区分度、不会改变计划的通用问句 */
export const GENERIC_CLARIFY_QUESTIONS = [
  "你最想要什么",
  "你最看重什么",
  "你在意什么",
  "你想怎么做",
  "第一步做什么",
  "怎么开始",
  "有什么想法",
  "优先级是什么",
  "你的目标是什么",
];

const EXECUTION_MODES = ["quick", "tool", "produce", "explore", "project"];
const TOOL_POLICIES = ["none", "read", "confirm-write"];
const MAX_TURNS_BY_MODE: Record<string, number> = {
  quick: 1,
  tool: 2,
  produce: 2,
  explore: 3,
  project: 3,
};

export type QualityCheckContext = {
  /** 用例允许的最大任务数 */
  maxTasks?: number;
};

type AnyPlan = Record<string, unknown>;

function asTasks(plan: AnyPlan): AnyPlan[] {
  return Array.isArray(plan.tasks)
    ? plan.tasks.filter(
        (task): task is AnyPlan => Boolean(task) && typeof task === "object",
      )
    : [];
}

/** 生成计划里承载长文本的字段，用于扫空泛说法和模板句 */
function textFields(plan: AnyPlan): string[] {
  const fields: string[] = [];
  for (const key of ["projectObjective", "projectMilestone", "reason"]) {
    if (typeof plan[key] === "string") fields.push(plan[key] as string);
  }
  for (const task of asTasks(plan)) {
    for (const key of [
      "title",
      "shortTitle",
      "doneWhen",
      "methodHint",
      "recommendation",
      "fallback",
      "notes",
    ]) {
      if (typeof task[key] === "string") fields.push(task[key] as string);
    }
    if (Array.isArray(task.executionSteps)) {
      fields.push(
        ...task.executionSteps.filter(
          (step): step is string => typeof step === "string",
        ),
      );
    }
  }
  return fields;
}

function findPhrases(texts: string[], phrases: string[]) {
  const hits: string[] = [];
  for (const text of texts) {
    for (const phrase of phrases) {
      if (text.includes(phrase)) hits.push(`${phrase}（出现在「${text.slice(0, 30)}…」）`);
    }
  }
  return hits;
}

/**
 * 返回所有问题；空数组代表这份计划通过检查。
 * 不抛异常，方便评测脚本把所有问题一次性列出来。
 */
export function checkPlanQuality(
  plan: unknown,
  context: QualityCheckContext = {},
): string[] {
  const issues: string[] = [];

  if (!plan || typeof plan !== "object") {
    return ["计划不是有效的 JSON 对象"];
  }

  const typed = plan as AnyPlan;
  const tasks = asTasks(typed);

  if (typeof typed.reason !== "string" || !typed.reason.trim()) {
    issues.push("缺少 reason，没有说明为什么这样安排");
  }

  if (
    typeof typed.taskDisposition === "string" &&
    !["attach", "new_tasks"].includes(typed.taskDisposition)
  ) {
    issues.push(`taskDisposition 非法：${typed.taskDisposition}`);
  }
  if (
    typed.mode !== undefined &&
    typed.mode !== null &&
    !["normal", "longterm", "explore"].includes(String(typed.mode))
  ) {
    issues.push(`mode 非法：${typed.mode}`);
  }
  if (!tasks.length) {
    issues.push("至少要有一条任务");
    return issues;
  }

  if (context.maxTasks && tasks.length > context.maxTasks) {
    issues.push(`任务数 ${tasks.length} 超过上限 ${context.maxTasks}`);
  }

  for (const [index, task] of tasks.entries()) {
    const label = `第 ${index + 1} 条任务`;

    const title = typeof task.title === "string" ? task.title.trim() : "";
    if (!title) {
      issues.push(`${label}缺标题`);
    }

    const doneWhenForThinking =
      typeof task.doneWhen === "string" ? task.doneWhen : "";
    for (const phrase of THINKING_ACTION_PHRASES) {
      if (title.includes(phrase)) {
        issues.push(`${label}把「想」当成任务动作：${phrase}`);
      }
      if (doneWhenForThinking.includes(phrase)) {
        issues.push(`${label}的完成标准还停在「想」：${phrase}`);
      }
    }

    const mode = typeof task.executionMode === "string" ? task.executionMode : "";
    if (mode && !EXECUTION_MODES.includes(mode)) {
      issues.push(`${label}的 executionMode 非法：${mode}`);
    }

    const maxTurns = task.maxTurns;
    if (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1) {
      issues.push(`${label}的 maxTurns 不是正整数`);
    } else if (mode && MAX_TURNS_BY_MODE[mode] && maxTurns !== MAX_TURNS_BY_MODE[mode]) {
      issues.push(
        `${label}的 maxTurns=${maxTurns}，与 ${mode} 要求的 ${MAX_TURNS_BY_MODE[mode]} 不一致`,
      );
    }

    const policy = typeof task.toolPolicy === "string" ? task.toolPolicy : "";
    if (policy && !TOOL_POLICIES.includes(policy)) {
      issues.push(`${label}的 toolPolicy 非法：${policy}`);
    }

    if (typeof task.doneWhen !== "string" || !task.doneWhen.trim()) {
      issues.push(`${label}缺少 doneWhen，没写清什么算完成`);
    }

    const methodHint =
      typeof task.methodHint === "string" ? task.methodHint.trim() : "";
    if (!methodHint) {
      issues.push(`${label}缺少 methodHint，没有给出具体做法`);
    } else if (methodHint.length < 8) {
      issues.push(`${label}的 methodHint 太短，不足以指导执行`);
    } else {
      for (const phrase of VAGUE_METHOD_PHRASES) {
        if (methodHint.includes(phrase)) {
          issues.push(`${label}的 methodHint 是空泛做法：${phrase}`);
        }
      }
    }

    const recommendation =
      typeof task.recommendation === "string" ? task.recommendation.trim() : "";
    if (!recommendation) {
      issues.push(`${label}缺少 recommendation，没有替用户做出默认决定`);
    }
    const executionSteps = Array.isArray(task.executionSteps)
      ? task.executionSteps.filter(
          (step): step is string => typeof step === "string" && Boolean(step.trim()),
        )
      : [];
    if (!executionSteps.length) {
      issues.push(`${label}缺少 executionSteps，没有现实执行路径`);
    }
    const fallback = typeof task.fallback === "string" ? task.fallback.trim() : "";
    if (mode && mode !== "quick" && !fallback) {
      issues.push(`${label}缺少 fallback，主方案失效时没有替代路径`);
    }

    const shortTitle =
      typeof task.shortTitle === "string" ? task.shortTitle.trim() : "";
    if (!shortTitle) {
      issues.push(`${label}缺少 shortTitle`);
    } else if (title) {
      if (shortTitle === title) {
        issues.push(`${label}的 shortTitle 与标题完全相同`);
      } else if (shortTitle.length >= 4 && title.startsWith(shortTitle)) {
        issues.push(`${label}的 shortTitle 是标题开头的截断：「${shortTitle}」`);
      }
    }
  }

  const texts = textFields(typed);
  for (const hit of findPhrases(texts, VAGUE_PHRASES)) {
    issues.push(`出现空泛说法：${hit}`);
  }
  for (const hit of findPhrases(texts, TEMPLATE_PHRASES)) {
    issues.push(`出现模板句：${hit}`);
  }
  if (findPhrases(texts, RECORD_TOOL_PHRASES).length) {
    issues.push("把动作落到记录工具上：载体应该是事情真正发生的地方");
  }

  return issues;
}

export type ClarificationQualityContext = {
  originalIdea?: string;
  previousQuestions?: string[];
  contextFacts?: string[];
};

type AnyClarification = Record<string, unknown>;

function nonEmptyString(value: unknown) {
  return typeof value === "string" && Boolean(value.trim());
}

function hasSharedFragment(left: string, right: string) {
  const cleanLeft = left.replace(/[^\p{L}\p{N}]/gu, "");
  const cleanRight = right.replace(/[^\p{L}\p{N}]/gu, "");
  if (!cleanLeft || !cleanRight) return false;
  const stopFragments = new Set([
    "一个",
    "这个",
    "这些",
    "可以",
    "可能",
    "就是",
    "什么",
    "东西",
    "还有",
    "已经",
    "现在",
  ]);
  const minimum = 2;
  for (let length = Math.min(6, cleanLeft.length); length >= minimum; length -= 1) {
    for (let index = 0; index + length <= cleanLeft.length; index += 1) {
      const fragment = cleanLeft.slice(index, index + length);
      if (stopFragments.has(fragment)) continue;
      if (cleanRight.includes(fragment)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 检查一轮澄清输出是否真的在“做判断”，而不是换一种方式问问卷。
 * 这里不评价模型是否聪明，只拦住结构缺失、重复提问和明显通用问句。
 */
const PRODUCT_DEFINITION_QUESTION =
  /给谁用|要完成什么|核心功能|产品定位|目标用户|功能范围|成功指标|哪类用户/;

const SUBPROBLEM_PATH_QUESTION =
  /你更想先.*还是|先.*还是.*(?:解决|处理|同步|开口|做|开始)|要.*还是.*(?:同步|开口|解决|处理)/;

export function checkClarificationQuality(
  value: unknown,
  context: ClarificationQualityContext = {},
): string[] {
  const issues: string[] = [];
  if (!value || typeof value !== "object") {
    return ["澄清结果不是有效的 JSON 对象"];
  }

  const raw = value as AnyClarification;
  const frame =
    raw.frame && typeof raw.frame === "object"
      ? (raw.frame as Record<string, unknown>)
      : null;
  if (!frame) {
    issues.push("缺少 frame，无法确认是否先形成了推进判断");
  } else {
    for (const key of [
      "surfaceRequest",
      "coreNeedHypothesis",
      "decisionFork",
      "decisiveUnknown",
      "whyItChangesPlan",
    ]) {
      if (!nonEmptyString(frame[key])) {
        issues.push(`frame 缺少 ${key}`);
      }
    }
    const readiness = frame.readiness;
    if (!["ready", "needs_context", "needs_meaning"].includes(String(readiness))) {
      issues.push("frame.readiness 非法或缺失");
    } else if (readiness !== "ready") {
      if (!Array.isArray(frame.missingSlots) || frame.missingSlots.length === 0) {
        issues.push("输入不完整时缺少 missingSlots");
      }
      if (!nonEmptyString(frame.completionPrompt)) {
        issues.push("输入不完整时缺少 completionPrompt");
      }
      if (
        !Array.isArray(frame.completionOptions) ||
        frame.completionOptions.length < 2
      ) {
        issues.push("输入不完整时缺少 completionOptions");
      }
    }
  }

  if (raw.done === true) {
    if (raw.question !== null && raw.question !== undefined) {
      issues.push("结束时仍在返回问题，澄清没有真正收口");
    }
    const summary =
      raw.summary && typeof raw.summary === "object"
        ? (raw.summary as Record<string, unknown>)
        : null;
    if (!summary) {
      issues.push("结束时缺少 summary");
    } else {
      if (!nonEmptyString(summary.realProblem)) {
        issues.push("summary 缺少 realProblem");
      }
      if (!nonEmptyString(summary.workingAssumption)) {
        issues.push("summary 缺少 workingAssumption，无法说明带着什么假设往下走");
      }
      if (nonEmptyString(summary.newQuestion)) {
        issues.push("结束时仍留下会影响计划的新问题");
      }
    }
    return issues;
  }

  const question =
    raw.question && typeof raw.question === "object"
      ? (raw.question as Record<string, unknown>)
      : null;
  if (!question) {
    issues.push("继续提问时缺少 question");
    return issues;
  }

  const questionText = nonEmptyString(question.question)
    ? String(question.question).trim()
    : "";
  if (!questionText) {
    issues.push("question.question 为空");
  } else if (questionText.length < 8) {
    issues.push("问题太短，缺少具体对象");
  }
  if (questionText) {
    if (PRODUCT_DEFINITION_QUESTION.test(questionText)) {
      issues.push("问题把产品/项目定义直接推回给用户");
    }
    if (SUBPROBLEM_PATH_QUESTION.test(questionText)) {
      issues.push("问题把同一目标下的两个子步骤推回给用户");
    }
    for (const phrase of GENERIC_CLARIFY_QUESTIONS) {
      if (questionText.includes(phrase)) {
        issues.push(`问题是通用问句：${phrase}`);
      }
    }
    const originalIdea = context.originalIdea?.trim() ?? "";
    if (originalIdea) {
      // 选项也是用户实际看到的语境：问句用通用句式、选项里带上用户的对象，
      // 对用户同样是具体的，不能只拿问句本身判定。
      const optionText = Array.isArray(question.options)
        ? question.options
            .filter((item): item is string => typeof item === "string")
            .join(" ")
            .trim()
        : "";
      const groundingText = `${questionText} ${optionText}`.trim();
      const referencesContext =
        /这(?:个|些|几|六|两|三)?|其中|上面|前面|刚才|上述/.test(groundingText);
      // 不要求逐字复述，但至少要和用户原话共享一个具体词段。
      const facts = [originalIdea, ...(context.contextFacts ?? [])];
      const groundedInContext = facts.some((fact) =>
        hasSharedFragment(fact, groundingText),
      );
      if (!referencesContext && !groundedInContext) {
        issues.push("问题没有引用用户原话里的具体对象");
      }
    }
  }

  const previous = new Set(
    (context.previousQuestions ?? []).map((item) => item.trim()),
  );
  if (questionText && previous.has(questionText)) {
    issues.push("问题与之前重复");
  }

  const options = Array.isArray(question.options)
    ? question.options.filter(
        (option): option is string =>
          typeof option === "string" && Boolean(option.trim()),
      )
    : [];
  if (options.length < 2 || options.length > 6) {
    issues.push(`question.options 数量应为 2-6，当前 ${options.length}`);
  }
  if (new Set(options.map((option) => option.trim())).size !== options.length) {
    issues.push("question.options 有重复项");
  }

  return issues;
}

export type BaselineRow = {
  id: string;
  pass: boolean;
  failures?: string[];
  taskCount?: number;
};

export type BaselineComparison = {
  /** 基线通过、这次失败：真正的回归 */
  newFailures: Array<{ id: string; before: string[]; after: string[] }>;
  /** 基线失败、这次通过 */
  fixed: string[];
  /** 通过状态没变，但任务条数变了 */
  taskCountChanged: Array<{ id: string; before: number; after: number }>;
  /** 基线里没有的用例 */
  added: string[];
};

/**
 * 对比两次评测结果。
 * 只有 newFailures 才算回归 —— 修好旧问题、新增用例都不该让门禁拦住提交。
 */
export function compareAgainstBaseline(
  previousRows: BaselineRow[],
  currentRows: BaselineRow[],
): BaselineComparison {
  const previousById = new Map(previousRows.map((row) => [row.id, row]));
  const result: BaselineComparison = {
    newFailures: [],
    fixed: [],
    taskCountChanged: [],
    added: [],
  };

  for (const row of currentRows) {
    const before = previousById.get(row.id);
    if (!before) {
      result.added.push(row.id);
      continue;
    }
    if (before.pass && !row.pass) {
      result.newFailures.push({
        id: row.id,
        before: before.failures ?? [],
        after: row.failures ?? [],
      });
      continue;
    }
    if (!before.pass && row.pass) {
      result.fixed.push(row.id);
      continue;
    }
    if (
      typeof before.taskCount === "number" &&
      typeof row.taskCount === "number" &&
      before.taskCount !== row.taskCount
    ) {
      result.taskCountChanged.push({
        id: row.id,
        before: before.taskCount,
        after: row.taskCount,
      });
    }
  }

  return result;
}
