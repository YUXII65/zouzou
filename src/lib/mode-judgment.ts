import { extractJsonObject as extractJson } from "@/lib/json-extract";
import { isProjectMode, type ProjectMode } from "@/lib/work-mode";

/**
 * 从模式判断器的返回里取出 mode。
 *
 * 注意：extractJson 只取第一个平衡的 {...}，数组 [{...}] 会被剥成单个对象，
 * 所以这里必须同时接受"单对象"和"对象数组"，不能只判数组——
 * 之前只判数组，导致模型判对了也会掉进兜底 normal（实测三条全变 normal）。
 */
export function pickModeFromJudgment(text: string | null | undefined): ProjectMode {
  if (!text) return "normal";
  try {
    const parsed = JSON.parse(extractJson(text) ?? "null") as unknown;
    const candidate = Array.isArray(parsed)
      ? parsed.find((item) => Boolean(item) && typeof item === "object")
      : parsed;
    const mode =
      candidate && typeof candidate === "object"
        ? (candidate as Record<string, unknown>).mode
        : null;
    return isProjectMode(mode) ? mode : "normal";
  } catch {
    return "normal";
  }
}
