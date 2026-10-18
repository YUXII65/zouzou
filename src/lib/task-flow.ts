import { isPlaceholderText } from "@/lib/ai-quality";

export const OPEN_TASK_STATUSES = ["todo", "in_progress"] as const;

/** 仅作为 JSON 安全上限，不表示模型应生成这么多，也不作为产品目标。 */
export const MAX_AI_TASKS_PER_PLAN = 6;

export const MAX_REVIEW_NEXT_ACTIONS = 1;
export function isOpenTaskStatus(status: string | null | undefined) {
  return status === "todo" || status === "in_progress";
}

type PlannedTaskLike = {
  title: string;
  notes?: string | null;
};

/**
 * 把模型给出的连续步骤收进一个当前任务，而不是继续新增同级任务。
 * 未保留的步骤会写进 notes，避免信息静默丢失。
 */
export function collapsePlannedTasks<T extends PlannedTaskLike>(
  tasks: T[],
  limit: number,
): T[] {
  if (limit <= 0) return [];
  if (tasks.length <= limit) return tasks;

  const kept = tasks.slice(0, limit);
  const primary = kept[0];
  if (!primary) return kept;

  const mergedSteps = tasks
    .slice(limit)
    .map((task) => {
      const title = task.title.trim();
      const notes = task.notes?.trim();
      return notes ? `- ${title}：${notes}` : `- ${title}`;
    })
    .filter(Boolean);
  const continuation = mergedSteps.length
    ? `后续步骤（合并到当前任务，不再单独建任务）：\n${mergedSteps.join("\n")}`
    : "";
  const notes = [primary.notes?.trim(), continuation]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);

  return [{ ...primary, notes }, ...kept.slice(1)];
}

export type ReviewNextActionInput = {
  title: string;
  shortTitle: string;
};

/** 复盘文本框统一按“两行一条”解析，并且只保留一条自动下一步。 */
export function parseReviewNextActions(raw: string): ReviewNextActionInput[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[-*]\s*/, "")
        .replace(/^\d+[.、)]\s*/, "")
        .trim(),
    )
    .filter(Boolean);
  const actions: ReviewNextActionInput[] = [];
  for (
    let index = 0;
    index < lines.length && actions.length < MAX_REVIEW_NEXT_ACTIONS;
    index += 2
  ) {
    const shortTitle = lines[index].trim().slice(0, 80);
    if (!shortTitle || isPlaceholderText(shortTitle)) continue;
    const rawDetail = (lines[index + 1] ?? shortTitle).trim().slice(0, 200);
    const detail = rawDetail && !isPlaceholderText(rawDetail) ? rawDetail : shortTitle;
    actions.push({ title: detail, shortTitle });
  }
  return actions;
}

export function formatReviewNextActions(actions: ReviewNextActionInput[]) {
  return actions
    .map((action) =>
      action.shortTitle !== action.title
        ? `${action.shortTitle}\n${action.title}`
        : action.shortTitle,
    )
    .join("\n");
}

function normalizeReviewText(value: string | null | undefined) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function shouldSyncReviewActions(
  status: string,
  existingNextActions: string | null | undefined,
  nextActions: string | null | undefined,
) {
  return status !== "final" || !reviewNextActionsEqual(existingNextActions, nextActions);
}
export function reviewNextActionsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return normalizeReviewText(left) === normalizeReviewText(right);
}
/** 把新判断接到已有任务上，重复保存不会重复追加同一段内容。 */
export function appendTaskContinuation(
  existingNotes: string | null | undefined,
  title: string,
  detail?: string | null,
) {
  const cleanTitle = title.trim();
  const cleanDetail = detail?.trim();
  if (!cleanTitle) return existingNotes?.trim() ?? null;

  const block = cleanDetail
    ? `补充：${cleanTitle}\n${cleanDetail}`
    : `补充：${cleanTitle}`;
  const current = existingNotes?.trim() ?? "";
  if (current.includes(block)) return current;
  return [current, block].filter(Boolean).join("\n\n").slice(0, 4000);
}
