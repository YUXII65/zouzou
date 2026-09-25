/**
 * 首次欢迎页总开关。
 * 暂时关闭：新用户注册、登录或开始游客体验后直接进入主界面。
 * 重新开启时改回 true 即可恢复 /welcome 四步引导。
 */
export const FIRST_RUN_GUIDE_ENABLED = false;

export const DEFAULT_ENTRY_PATH = "/";

export function newUserEntryPath(
  next: string,
  enabled = FIRST_RUN_GUIDE_ENABLED,
) {
  if (enabled) return "/welcome?signup=register";
  return next.startsWith("/welcome") ? DEFAULT_ENTRY_PATH : next;
}

export function guestEntryPath(enabled = FIRST_RUN_GUIDE_ENABLED) {
  return enabled ? "/welcome?guest=1&signup=guest" : DEFAULT_ENTRY_PATH;
}
