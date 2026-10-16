import { TOUR_EVENT, TOUR_STORAGE_KEY, type TourStep } from "@/lib/tour";

const AI_QUESTION_KEY = "next_step_ai_question_asked";

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

