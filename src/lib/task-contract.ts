import { routeTool, type ToolKind } from "@/lib/tool-router";

export type TaskExecutionMode = "quick" | "tool" | "produce" | "explore" | "project";
export type TaskToolPolicy = "none" | "read" | "confirm-write";

export type TaskContract = {
  executionMode: TaskExecutionMode;
  doneWhen: string;
  maxTurns: number;
  toolPolicy: TaskToolPolicy;
  toolHint: ToolKind;
};

const PROJECT_SIGNAL =
  /项目|持续|长期|习惯|每天|每周|系统|平台|产品|转行|自媒体|作品集|课程|经营/;
const EXPLORE_SIGNAL =
  /验证|调研|比较|选择|要不要|是否|值不值得|方向|竞品|需求|市场|不确定|犹豫/;
const PRODUCE_SIGNAL =
  /写|做|整理|生成|准备|方案|草稿|文章|报告|笔记|简历|作品|页面|代码|脚本|表格|清单|设计/;
const QUICK_SIGNAL =
  /查|找|列|解释|翻译|计算|告诉我|给我|推荐|总结|改成|润色|判断|看一下/;

function compact(value: string, length = 40) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

/** 从任务原文里挑一个能当"结果"的对象，避免完成标准千篇一律 */
function subject(signal: string) {
  const clean = signal
    .replace(/^我?想(?:要|做|把|开始|尝试)?/, "")
    .replace(/^(?:先|帮我|请|麻烦)/, "")
    .trim();
  return compact(clean);
}

/**
 * 把一条任务翻译成「怎么做」的合同：
 * 用哪种执行方式、什么算完成、最多追问几轮、要不要借助外部工具。
 *
 * 这里只做轻量规则判断兜底，真正的语义判断交给模型；
 * 规则的作用是保证小任务不会被无限工程化，也不会永远停在追问上。
 */
export function buildTaskContract(input: string, title?: string | null): TaskContract {
  const signal = `${title ?? ""} ${input}`.trim();
  const tool = routeTool(signal);
  const topic = subject(signal);
  const needsTool = tool.policy !== "none";
  const hasProjectSignal =
    PROJECT_SIGNAL.test(signal) && !QUICK_SIGNAL.test(signal);
  const hasExploreSignal = EXPLORE_SIGNAL.test(signal);
  const hasProduceSignal = PRODUCE_SIGNAL.test(signal);

  if (hasProjectSignal) {
    return {
      executionMode: "project",
      doneWhen: "这一阶段留下一个能被人直接检查的结果，并写清下一次从哪里继续",
      maxTurns: 3,
      toolPolicy: tool.policy,
      toolHint: tool.kind,
    };
  }

  if (hasExploreSignal) {
    return {
      executionMode: "explore",
      doneWhen: "拿到一条能真正改变判断的信息，而不是又多了一份待读资料",
      maxTurns: 3,
      toolPolicy: tool.policy,
      toolHint: tool.kind,
    };
  }

  if (needsTool) {
    return {
      executionMode: "tool",
      doneWhen: `围绕「${topic}」拿到一条有来源、现在就能用的结论`,
      maxTurns: 2,
      toolPolicy: tool.policy,
      toolHint: tool.kind,
    };
  }

  if (hasProduceSignal) {
    return {
      executionMode: "produce",
      doneWhen: `围绕「${topic}」产出一份具体结果，别人能直接看到或使用`,
      maxTurns: 2,
      toolPolicy: "none",
      toolHint: "none",
    };
  }

  return {
    executionMode: "quick",
    doneWhen: `围绕「${topic}」得到一个现在就能用的答案`,
    maxTurns: 1,
    toolPolicy: "none",
    toolHint: "none",
  };
}

export function taskModeLabel(mode: string | null | undefined) {
  switch (mode) {
    case "tool":
      return "查资料";
    case "produce":
      return "做产物";
    case "explore":
      return "做验证";
    case "project":
      return "长期推进";
    default:
      return "直接完成";
  }
}
