/**
 * 新手引导总开关。
 *
 * 暂时关闭：用户要求先把引导从界面移除（不是删代码）。
 * 改回 true 即可恢复三步引导，不用动别的地方。
 */
export const FIRST_RUN_TOUR_ENABLED = true;

export const TOUR_STORAGE_KEY = "next_step_tour";
export const TOUR_FORCE_STORAGE_KEY = "next_step_tour_force";
export const TOUR_EVENT = "next-step:tour";

/** 引导要指向的元素，统一用 data-tour 标记，避免各处写错选择器 */
export const TOUR_TARGETS = {
  quickCapture: '[data-tour="quick-capture"]',
  clarifyOptions: '[data-tour="clarify-options"]',
  homeNav: '[data-tour="home-nav"]',
  nextButton: '[data-tour="task-next"]',
  stickyButton: '[data-tour="task-sticky"]',
  bottomNav: '[data-tour="bottom-nav"], [data-tour="side-nav"]',
  guestBanner: '[data-tour="guest-banner"]',
} as const;

export type TourStep = "1" | "2" | "3" | "done";

export function normalizeTourStep(value: unknown): TourStep {
  // 历史数据里可能存过已取消的第 4 步（复盘引导），视为已完成，
  // 避免老用户被重置回第 1 步。
  if (value === "4") return "done";
  if (value === "2" || value === "3" || value === "done") {
    return value;
  }
  return "1";
}

export function tourOrder(step: TourStep) {
  if (step === "done") return 99;
  return Number(step);
}
