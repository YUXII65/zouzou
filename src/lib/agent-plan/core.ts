import type {
  InboxClarificationFrame,
  InboxClarificationHistoryItem,
  InboxClarificationSummary,
  InboxClarificationTranslation,
  InboxPlan,
  InboxPlanTrack,
  InboxPlanUserCard,
  InboxProjectContext,
} from "@/lib/ai";
import { readPlanTracks } from "@/lib/project-track";
import { checkPlanQuality } from "@/lib/ai-quality";
import { MAX_AI_TASKS_PER_PLAN } from "@/lib/task-flow";
import { extractJsonObject as extractJson } from "@/lib/json-extract";
import type { WorkModeJudgment } from "@/lib/mode-judgment";
import type { ProjectMode } from "@/lib/work-mode";
import type { PlanWebEvidence } from "@/lib/web-search";

export type NormalAgentBrief = {
  goal: string;
  confirmedFacts: string[];
  constraints: string[];
  successSignal: string;
  assumptions: string[];
  ifWrongThen: string;
};

export type NormalAgentPlanStep = {
  action: string;
  how: string;
  output: string;
};

/** 第二段规划执行 Agent 排出的一条规划；只有一条路，不是候选。 */
export type NormalAgentPlan = {
  goal: string;
  constraints: string[];
  route: string;
  steps: NormalAgentPlanStep[];
  /** explore 模式的方向线路；其他模式为空数组。 */
  tracks: InboxPlanTrack[];
};

export type NormalAgentOutcome =
  | { status: "ok"; plan: InboxPlan }
  | { status: "not_normal"; reason: string }
  | { status: "disabled" }
  | { status: "failed"; reason: string; issues: string[] };

export type NormalAgentInput = {
  content: string;
  history?: InboxClarificationHistoryItem[];
  summary?: InboxClarificationSummary | null;
  frame?: InboxClarificationFrame | null;
  translation?: InboxClarificationTranslation | null;
  projectContext?: InboxProjectContext[];
  memorySummary?: string | null;
  evidence?: string[];
  decisionMemory?: string[];
  webEvidence?: PlanWebEvidence | null;
  maxTasks?: number | null;
  /** 澄清收口后定下的模式；有它时第 2 段方案 Agent 只承接，不再自己判。 */
  workMode?: ProjectMode | null;
  modeJudgment?: WorkModeJudgment | null;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  onDelta?: (delta: string) => void;
};

/** 计划链的任务数安全上限；实际条数由调用方传入的 maxTasks 决定。 */
export const MAX_CHAIN_TASKS = MAX_AI_TASKS_PER_PLAN;
const STRING_LIMIT = 500;
const CHOICE_LANGUAGE =
  /(?:可以选择|可选|二选一|看情况|根据情况|自行决定|自己决定|先比较|先调研|先确认方向|(?:你|可以|建议).{0,8}(?:选一个|决定|比较|调研))/;
const GENERIC_FIRST_ACTION =
  /^(?:先)?(?:确认|比较|调研|了解|想清楚|考虑)|看情况|自行决定/;
const LOW_LEVEL_UI_TUTORIAL =
  /(?:打开|点击|点开|进入|选择|输入|搜索|复制|粘贴).{0,18}(?:日历|日期|搜索框|输入框|按钮|菜单|下拉框|设置页|标签页|控件|备忘录)/;

export function readText(value: unknown, limit = STRING_LIMIT) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : "";
}

export function readList(value: unknown, limit = 8, itemLimit = 300) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, itemLimit))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

export function parseObject(text: string | null) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(extractJson(text) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}


export function readPlan(raw: unknown): NormalAgentPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const planRaw = (raw as Record<string, unknown>).plan;
  if (!planRaw || typeof planRaw !== "object") return null;
  const value = planRaw as Record<string, unknown>;
  const goal = readText(value.goal, 300);
  const route = readText(value.route, 800);
  const steps = Array.isArray(value.steps)
    ? value.steps
        .map((item): NormalAgentPlanStep | null => {
          if (!item || typeof item !== "object") return null;
          const step = item as Record<string, unknown>;
          const action = readText(step.action, 240);
          if (!action) return null;
          return {
            action,
            how: readText(step.how, 400),
            output: readText(step.output, 240),
          };
        })
        .filter((item): item is NormalAgentPlanStep => Boolean(item))
        .slice(0, 8)
    : [];
  if (!goal || !route || !steps.length) return null;
  return {
    goal,
    constraints: readList(value.constraints, 6, 200),
    route,
    steps,
    tracks: readPlanTracks(value.tracks),
  };
}

const PROJECT_NAME_META =
  /用户想|想从|这一类|这类|开始|做这件事|相关/;
const PROJECT_NAME_SIGNAL =
  /进阶|提升|练习|学习|训练|整理|搭建|建立|完成|做出|做成|制作|发布|写作|分享|管理|复盘|改进|优化|养成|探索|规划|做饭|烹饪|焖饭|煮饭|求职|转行|备考|设计|开发|运营|创作|拍摄|剪辑|维护|健身|减脂|读书|阅读|输出|记录|沟通|谈判|面试|申请|推进|落地|交付|经营|启动|系统|平台|作品集|账号|计划|闭环|方案|流程|手册|指南|课程|网站|应用|工具|项目|系列/;

function projectNameFromGoal(goal: string) {
  const clauses = goal
    .split(/[，,。；;：:！？!?]/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const actionClause =
    clauses.find((clause) => PROJECT_NAME_SIGNAL.test(clause)) ??
    clauses.at(-1) ??
    goal;
  let cleaned = actionClause
    .replace(/^(?:用户|我)?(?:想|想要|希望|打算|准备|需要)?(?:从)?\s*/u, "")
    .replace(/^(?:让|把|将|用|对|给)\s*/u, "")
    .replace(/(?:这一类|这类|这样的)?(?:开始|进行|相关).*$/u, "")
    .replace(/(?:日常的|现在的|当前的|原来的|那一个|这一个)\s*/gu, "")
    .replace(/(?:做出|做成|做到|完成|得到|形成|变成|实现|提升|改进|优化).*$/u, "")
    .trim();
  if (!cleaned) cleaned = actionClause.trim();
  if (cleaned.length < 6 && /进阶|提升|更好|明显更好|改善|升级/.test(goal)) {
    cleaned += "进阶";
  }
  return cleaned.slice(0, 14) || "新项目";
}

/** 项目名是文件夹名，不是对用户想法的转述。 */
export function normalizeProjectName(rawName: unknown, goal: string) {
  const name =
    typeof rawName === "string"
      ? rawName.replace(/[（(][^）)]*[）)]/g, "").trim().replace(/\s+/g, " ")
      : "";
  if (name && !PROJECT_NAME_META.test(name) && PROJECT_NAME_SIGNAL.test(name)) {
    return name.slice(0, 14);
  }
  const fallback = projectNameFromGoal(goal);
  return PROJECT_NAME_META.test(fallback) ? "新项目" : fallback;
}
export function readUserCard(raw: unknown): InboxPlanUserCard | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const card: InboxPlanUserCard = {
    understanding: readText(value.understanding, 300),
    firstAction: readText(value.firstAction, 300),
    how: readText(value.how, 400),
    doneWhen: readText(value.doneWhen, 300),
    ifWrongThen: readText(value.ifWrongThen, 300) || undefined,
  };
  return card.understanding && card.firstAction && card.how && card.doneWhen
    ? card
    : null;
}

export function auditNormalAgentPlan(
  plan: InboxPlan,
  brief: NormalAgentBrief,
) {
  const issues = checkPlanQuality(plan, { maxTasks: MAX_CHAIN_TASKS });
  if ((plan.reason ?? "").length < 12) {
    issues.push("reason 太短，无法说明为什么这样安排");
  }
  if (!plan.userCard) {
    issues.push("缺少用户最终行动卡");
  } else {
    if (CHOICE_LANGUAGE.test(JSON.stringify(plan.userCard))) {
      issues.push("用户结果里出现了候选或二选一表达");
    }
    if (GENERIC_FIRST_ACTION.test(plan.userCard.firstAction)) {
      issues.push("第一条动作仍在让用户先做判断");
    }
  }
  const instructionalText = [
    plan.userCard?.how ?? "",
    ...plan.tasks.flatMap((task) => [task.methodHint, ...(task.executionSteps ?? [])]),
  ].join("\n");
  if (LOW_LEVEL_UI_TUTORIAL.test(instructionalText)) {
    issues.push("仍在写显而易见的软件点击教程");
  }
  if (brief.confirmedFacts.length && !(plan.agent?.usedFacts?.length)) {
    issues.push("没有说明方案使用了哪条已确认事实");
  }
  if (
    plan.tasks.some((task) =>
      GENERIC_FIRST_ACTION.test(task.title) || GENERIC_FIRST_ACTION.test(task.shortTitle),
    )
  ) {
    issues.push("任务标题仍在让用户先做判断");
  }
  return [...new Set(issues)];
}

export function createAgentFailedPlan(input: {
  reason: string;
  issues: string[];
}): InboxPlan {
  return {
    action: "single_task",
    taskDisposition: "new_tasks",
    projectName: null,
    projectObjective: null,
    projectMilestone: null,
    tasks: [],
    mode: "normal",
    reason: input.reason,
    source: "agent_failed",
    agent: {
      usedFacts: [],
      assumptionsUsed: [],
      auditIssues: input.issues,
    },
  };
}
