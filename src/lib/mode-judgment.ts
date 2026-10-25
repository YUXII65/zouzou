import { extractJsonObject as extractJson } from "@/lib/json-extract";
import {
  isAiProjectMode,
  type AiProjectMode,
} from "@/lib/work-mode";

export type ModeEndStateType = "finite" | "ongoing" | "unclear";
export type ModeTimeHorizon = "single_session" | "multi_day" | "open";

export type WorkModeFrame = {
  endState: string;
  endStateType: ModeEndStateType;
  timeHorizon: ModeTimeHorizon;
  hasDeliverable: boolean;
  hasDeadline: boolean;
  continuationIntent: boolean;
};

export type WorkModeJudgment = {
  mode: AiProjectMode;
  confidence: number;
  realNeed: string;
  frame: WorkModeFrame | null;
  decisiveEvidence: string[];
  fallbackMode: AiProjectMode | null;
  reason: string;
  source: "model" | "heuristic";
};

const LOW_CONFIDENCE = 0.65;

function readString(value: unknown, limit = 500) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : "";
}

function readBoolean(value: unknown) {
  return value === true;
}

function readMode(value: unknown): AiProjectMode | null {
  return isAiProjectMode(value) ? value : null;
}

function readFrame(value: unknown): WorkModeFrame | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const endStateType =
    raw.endStateType === "finite" ||
    raw.endStateType === "ongoing" ||
    raw.endStateType === "unclear"
      ? raw.endStateType
      : "unclear";
  const timeHorizon =
    raw.timeHorizon === "single_session" ||
    raw.timeHorizon === "multi_day" ||
    raw.timeHorizon === "open"
      ? raw.timeHorizon
      : "open";
  return {
    endState: readString(raw.endState),
    endStateType,
    timeHorizon,
    hasDeliverable: readBoolean(raw.hasDeliverable),
    hasDeadline: readBoolean(raw.hasDeadline),
    continuationIntent: readBoolean(raw.continuationIntent),
  };
}

/**
 * 从模式判断器返回里解析完整判断。
 *
 * 返回 null 表示模型没有给出可用判断；调用方应走本地启发式兜底，
 * 不能把非空但损坏的输出静默当成 normal。
 */
export function parseModeJudgment(
  text: string | null | undefined,
): WorkModeJudgment | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(extractJson(text) ?? "null") as unknown;
    const candidate = Array.isArray(parsed)
      ? parsed.find((item) => Boolean(item) && typeof item === "object")
      : parsed;
    if (!candidate || typeof candidate !== "object") return null;
    const raw = candidate as Record<string, unknown>;
    const originalMode = readMode(raw.mode);
    if (!originalMode) return null;

    const confidenceRaw =
      typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
        ? raw.confidence
        : 0.5;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    // 探索最容易做成空转。低置信度时降到 normal，但保留原判断供计划和排查使用。
    const mode: AiProjectMode =
      originalMode === "explore" && confidence < LOW_CONFIDENCE
        ? "normal"
        : originalMode;
    const fallbackMode =
      readMode(raw.fallbackMode) ??
      (mode !== originalMode ? originalMode : null);

    return {
      mode,
      confidence,
      realNeed: readString(raw.realNeed),
      frame: readFrame(raw.frame),
      decisiveEvidence: Array.isArray(raw.decisiveEvidence)
        ? raw.decisiveEvidence
            .map((item) => readString(item, 300))
            .filter(Boolean)
            .slice(0, 5)
        : [],
      fallbackMode,
      reason: readString(raw.reason, 500),
      source: "model",
    };
  } catch {
    return null;
  }
}

/** 模型不可用或输出损坏时的本地兜底。 */
export function heuristicModeJudgment(input: {
  mode: AiProjectMode;
  realNeed: string;
}): WorkModeJudgment {
  return {
    mode: input.mode,
    confidence: 0.35,
    realNeed: input.realNeed.trim().slice(0, 500),
    frame: null,
    decisiveEvidence: [],
    fallbackMode: null,
    reason: "模型没有返回可用的模式判断，使用本地启发式兜底。",
    source: "heuristic",
  };
}

/** 兼容旧调用：只取 mode。新代码应使用 parseModeJudgment。 */
export function pickModeFromJudgment(
  text: string | null | undefined,
): AiProjectMode {
  return parseModeJudgment(text)?.mode ?? "normal";
}
