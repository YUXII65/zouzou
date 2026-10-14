import type { Project } from "@prisma/client";

/**
 * 走走 v3.3 的推进模式。
 *
 * - smart：默认。由 AI 读完想法后自己判断更接近哪一种，用户不用先想清楚。
 * - normal：普通模式。一件事、一个结果，做完就收。
 * - longterm：长期模式。持续多轮推进，有阶段和里程碑。
 * - explore：探索模式。方向还没定，先做小验证再决定要不要继续。
 */
export type WorkMode = "smart" | "normal" | "longterm" | "explore";

/** 真正落到项目上的模式：smart 只是入口，不会成为项目的最终归属。 */
export type ProjectMode = Exclude<WorkMode, "smart">;

export const PROJECT_MODES: ProjectMode[] = ["normal", "longterm", "explore"];

export const PROJECT_MODE_META: Record<
  ProjectMode,
  {
    label: string;
    /** 文件夹正文色 */
    swatchClass: string;
    /** 文件夹图标的填充色 */
    fillClass: string;
    /** 文件夹浅底色 */
    softClass: string;
    /** 文字色 */
    textClass: string;
    /** 边框色 */
    borderClass: string;
    /** 文件夹标签的圆点色 */
    dotClass: string;
    hint: string;
  }
> = {
  normal: {
    label: "普通",
    swatchClass: "bg-mode-normal",
    fillClass: "fill-mode-normal",
    softClass: "bg-mode-normal-soft",
    textClass: "text-mode-normal-ink",
    borderClass: "border-mode-normal/30",
    dotClass: "bg-mode-normal",
    hint: "当下要处理掉的一件事",
  },
  longterm: {
    label: "长期",
    swatchClass: "bg-mode-longterm",
    fillClass: "fill-mode-longterm",
    softClass: "bg-mode-longterm-soft",
    textClass: "text-mode-longterm-ink",
    borderClass: "border-mode-longterm/30",
    dotClass: "bg-mode-longterm",
    hint: "有截止的跨天任务",
  },
  explore: {
    label: "探索",
    swatchClass: "bg-mode-explore",
    fillClass: "fill-mode-explore",
    softClass: "bg-mode-explore-soft",
    textClass: "text-mode-explore-ink",
    borderClass: "border-mode-explore/30",
    dotClass: "bg-mode-explore",
    hint: "没有终点的长期成长",
  },
};

export function isProjectMode(value: unknown): value is ProjectMode {
  return value === "normal" || value === "longterm" || value === "explore";
}

/** 把任意来源的值收敛成能落库的项目模式；smart / 脏值一律回落到普通。 */
export function normalizeProjectMode(value: unknown): ProjectMode {
  return isProjectMode(value) ? value : "normal";
}

export function projectModeOf(project: Pick<Project, "mode">): ProjectMode {
  return normalizeProjectMode(project.mode);
}

export function projectModeMeta(mode: unknown) {
  return PROJECT_MODE_META[normalizeProjectMode(mode)];
}
/**
 * 本地兜底的模式判断。
 *
 * 「有没有终点」决定模式，和难度无关：
 * - 有明确交付 / 截止的跨天任务 → longterm
 * - 能力、习惯、持续状态没有终点 → explore
 * - 其余当下的单件事 → normal
 *
 * 这里刻意不把「每天 / 每周 / 习惯」判成 longterm：习惯没有终点，
 * 判成一次性任务就等于「做完就结束」，把「从想变做」压成了「做小」。
 */
export function heuristicProjectMode(
  content: string,
  isProject: boolean,
): ProjectMode {
  if (/[\d一二三四五六七八九十两]\s*(?:天|周|月|年)|截止|交付|上线|发布|里程碑|阶段|期限内/.test(content)) {
    return "longterm";
  }
  if (/学|练|习惯|每天|每周|坚持|能力|审美|长期|持续|一直|慢慢|保持|状态/.test(content)) {
    return "explore";
  }
  if (/探索|试试|验证|不确定|方向|看看|调研|了解/.test(content)) {
    return "explore";
  }
  return isProject ? "longterm" : "normal";
}
