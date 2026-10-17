"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { confirmStagePreviewAction } from "@/app/actions";
import { MAX_LONGTERM_STAGES, type StagePreview } from "@/lib/project-progress-types";

/** 预览还没生成时，把当前交付物压成一句话显示，避免整段铺开。 */
function shortLine(text: string, limit = 20) {
  const source = text.trim();
  if (!source) return "";
  const first =
    source.split(/[，,。；;：:！？!?\n]/).find((part) => part.trim())?.trim() ??
    source;
  return first.length > limit ? first.slice(0, limit) + "…" : first;
}

/** 阶段总结取句尾结论，避免把一整段交付物直接铺出来。 */
function shortStageSummary(text: string, fallback: string, limit = 18) {
  const source = text.trim();
  if (!source) return fallback;
  const clauses = source
    .split(/[，,。；;：:\n、]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = clauses.length > 1 ? clauses[clauses.length - 1] : clauses[0];
  return shortLine(candidate, limit);
}

export function StagePreviewPanel({
  stage,
}: {
  stage: {
    id: string;
    order: number;
    status: string;
    deliverable: string;
    nextStage: StagePreview | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [autoRetry, setAutoRetry] = useState(0);

  const nextOrder = stage.order + 1;
  const canAdvance =
    Boolean(stage.nextStage?.tasks.length) && nextOrder <= MAX_LONGTERM_STAGES;
  const missingNextStage = !stage.nextStage;

  // 当前阶段的下一阶段总结会在任务状态变化后预生成；这里只做首屏兜底补取两次，
  // 用户不必手点「生成 / 重新生成」，也不会让「正在整理下一阶段」一直停着。
  useEffect(() => {
    if (!missingNextStage || autoRetry >= 2) return;
    const timer = window.setTimeout(() => {
      setAutoRetry((count) => count + 1);
      router.refresh();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [autoRetry, missingNextStage, router]);

  async function confirmNext() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("stageId", stage.id);
      await confirmStagePreviewAction(formData);
      router.refresh();
    } catch {
      setError("这次没有接上，再试一次");
    } finally {
      setPending(false);
    }
  }

  const currentSummary = shortStageSummary(
    stage.nextStage?.currentSummary || stage.deliverable,
    "正在整理当前阶段",
  );
  const nextSummary = shortStageSummary(
    stage.nextStage?.nextSummary || stage.nextStage?.nextMilestone || "",
    "正在整理下一阶段",
  );

  if (stage.status !== "ready") {
    return (
      <div className="mt-3 space-y-2">
        <div className="rounded-xl border border-accent/25 bg-accent-soft/60 px-3 py-2">
          <p className="text-xs leading-relaxed text-ink">
            <span className="font-medium text-accent-strong">
              {stage.order}/{MAX_LONGTERM_STAGES} 阶段：
            </span>
            {currentSummary}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface-muted/40 px-3 py-2">
          <p className="text-xs leading-relaxed text-ink">
            <span className="font-medium text-ink-muted">
              {nextOrder}/{MAX_LONGTERM_STAGES} 阶段：
            </span>
            {nextSummary}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-success/25 bg-success/5 p-4">
      {canAdvance ? (
        <>
          <p className="text-sm font-medium leading-6 text-ink">
            <span className="font-semibold text-success">
              {nextOrder}/{MAX_LONGTERM_STAGES} 阶段：
            </span>
            {nextSummary}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => void confirmNext()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ArrowRight className="size-3.5" />
              )}
              进入下一阶段
            </button>
          </div>
        </>
      ) : missingNextStage ? (
        <>
          <p className="text-sm font-medium leading-6 text-ink">
            <span className="font-semibold text-success">
              {nextOrder}/{MAX_LONGTERM_STAGES} 阶段：
            </span>
            {nextSummary}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium leading-6 text-ink">
            <span className="font-semibold text-success">
              {stage.order}/{MAX_LONGTERM_STAGES} 阶段：
            </span>
            {currentSummary}
          </p>
          <p className="mt-3 text-xs text-ink-muted">
            当前阶段已收口，不再自动接下一阶段。
          </p>
        </>
      )}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}