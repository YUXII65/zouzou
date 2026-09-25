import { TOUR_EVENT, TOUR_STORAGE_KEY, type TourStep } from "@/lib/tour";

const AI_QUESTION_KEY = "next_step_ai_question_asked";

function tourIsActive() {
  try {
    const value = localStorage.getItem(TOUR_STORAGE_KEY);
    return (
      value === "1" || value === "2" || value === "3" || value === "4"
    );
  } catch {
    return false;
  }
}

export function markFirstAiQuestionAsked() {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(AI_QUESTION_KEY, "1");
  } catch {
    // Ignore storage errors and continue without the hint.
  }
}

/** 告诉引导组件：用户已经推进了任务，可以进入下一步 */
export function notifyTourStep(step: TourStep) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(TOUR_STORAGE_KEY, step);
  } catch {
    // Ignore storage errors.
  }
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { step } }));
}

/** 首组计划任务全部收尾后，进入统一的第 4 步复盘引导。 */
export function markFirstTaskGroupDone() {
  notifyTourStep("4");
}

/** 当前是否处于新手引导中（用于图标是否展开文字等） */
export function firstRunTourActive() {
  if (typeof window === "undefined") return false;
  return tourIsActive();
}
