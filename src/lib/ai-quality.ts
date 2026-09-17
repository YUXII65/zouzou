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
    for (const key of ["title", "shortTitle", "doneWhen", "notes"]) {
      if (typeof task[key] === "string") fields.push(task[key] as string);
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
