export type DecisionHistoryTone =
  | "success"
  | "warning"
  | "danger"
  | "accent"
  | "muted";

export type DecisionHistoryItem = {
  id: string;
  createdAt: string;
  actionLabel: string;
  tone: DecisionHistoryTone;
  title: string;
  explanation: string;
};

type HistoryRecord = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: Date | string;
  task?: { title: string } | null;
  inboxItem?: { content: string } | null;
};

function truncate(value: string, max = 100) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function actionMeta(action: string): {
  label: string;
  tone: DecisionHistoryTone;
} {
  switch (action) {
    case "task_completed":
      return { label: "完成", tone: "success" };
    case "task_delayed":
      return { label: "延期", tone: "warning" };
    case "task_cancelled":
      return { label: "取消", tone: "danger" };
    case "plan_ignored":
      return { label: "忽略计划", tone: "muted" };
    case "plan_edited":
      return { label: "调整计划", tone: "accent" };
    case "plan_accepted":
      return { label: "接受计划", tone: "success" };
    case "suggestion_useful":
      return { label: "建议有用", tone: "success" };
    case "suggestion_useless":
      return { label: "建议无效", tone: "danger" };
    default:
      return { label: "决策更新", tone: "muted" };
  }
}

function extractDecisionExplanation(detail: string | null) {
  if (!detail) return "";
  const marker = "DecisionSession：";
  const markerIndex = detail.indexOf(marker);
  if (markerIndex < 0) return detail;
  try {
    const session = JSON.parse(detail.slice(markerIndex + marker.length)) as {
      explanation?: string;
      coreNeedHypothesis?: string;
      recommendation?: string;
    };
    return (
      session.explanation ||
      session.coreNeedHypothesis ||
      session.recommendation ||
      ""
    );
  } catch {
    return detail.slice(0, markerIndex).trim();
  }
}

export function buildDecisionHistory(
  records: HistoryRecord[],
): DecisionHistoryItem[] {
  return records.slice(0, 12).map((record) => {
    const meta = actionMeta(record.action);
    const target =
      record.task?.title ?? record.inboxItem?.content ?? "这条决策";
    const explanation = extractDecisionExplanation(record.detail);
    return {
      id: record.id,
      createdAt:
        record.createdAt instanceof Date
          ? record.createdAt.toISOString()
          : new Date(record.createdAt).toISOString(),
      actionLabel: meta.label,
      tone: meta.tone,
      title: truncate(target, 70),
      explanation: truncate(explanation || `${meta.label}了「${target}」`, 120),
    };
  });
}

export function inferredPreferenceSummary(
  preferences: Array<{ key: string; value: string; note: string | null }>,
) {
  const planScale = preferences.find(
    (preference) => preference.key === "plan_scale" && preference.value === "few",
  );
  if (!planScale) return "";
  return planScale.note || "根据最近的延期、编辑或无效反馈，计划密度已自动调低。";
}
