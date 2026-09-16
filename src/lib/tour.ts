export const TOUR_STORAGE_KEY = "next_step_tour";
export const TOUR_EVENT = "next-step:tour";

/** 引导要指向的元素，统一用 data-tour 标记，避免各处写错选择器 */
export const TOUR_TARGETS = {
  quickCapture: '[data-tour="quick-capture"]',
  homeNav: '[data-tour="home-nav"]',
  nextButton: '[data-tour="task-next"]',
  stickyButton: '[data-tour="task-sticky"]',
  bottomNav: '[data-tour="bottom-nav"], [data-tour="side-nav"]',
  reviewNav: '[data-tour="review-nav"]',
  guestBanner: '[data-tour="guest-banner"]',
} as const;

export type TourStep = "1" | "2" | "3" | "4" | "done";

export function normalizeTourStep(value: unknown): TourStep {
  if (
    value === "2" ||
    value === "3" ||
    value === "4" ||
    value === "done"
  ) {
    return value;
  }
  return "1";
}

export function tourOrder(step: TourStep) {
  if (step === "done") return 99;
  return Number(step);
}
