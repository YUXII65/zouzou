import type { InboxPlanTask } from "@/lib/ai";

export const MAX_LONGTERM_STAGES = 5;

export type StagePreview = {
  /** 当前阶段一句话总结（总结版展示用，不是交付物原文） */
  currentSummary: string;
  /** 下一阶段一句话总结（当前阶段就能看到） */
  nextSummary: string;
  nextMilestone: string;
  reason: string;
  tasks: InboxPlanTask[];
  source: "model" | "fallback";
};

export type ExploreContinuation = {
  decision: "continue" | "adjust" | "switch" | "pause";
  /** 这次推进哪条线：已有线路名，或新发现的方向名。 */
  trackName: string | null;
  /** 调整后的角色：主线还是支线。 */
  trackRole: "main" | "side";
  /** trackName 是新方向时，这条线在发展 / 验证什么。 */
  newTrackIntent: string | null;
  currentMilestone: string;
  reason: string;
  task: InboxPlanTask | null;
  source: "model" | "fallback";
};

export function parseStagePreview(value: string | null | undefined): StagePreview | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StagePreview;
    if (!parsed || typeof parsed !== "object" || typeof parsed.nextMilestone !== "string" || !Array.isArray(parsed.tasks)) {
      return null;
    }
    // 兼容没有 summary 字段的旧预览。
    return {
      ...parsed,
      currentSummary:
        typeof parsed.currentSummary === "string" ? parsed.currentSummary : "",
      nextSummary:
        typeof parsed.nextSummary === "string" ? parsed.nextSummary : "",
    };
  } catch {
    return null;
  }
}

