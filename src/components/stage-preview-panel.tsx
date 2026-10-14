"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import {
  confirmStagePreviewAction,
  generateStagePreviewAction,
} from "@/app/actions";
import type { StagePreview } from "@/lib/project-progress-types";

/** 预览还没生成时，把当前交付物压成一句话显示，避免整段铺开。 */
function shortLine(text: string, limit = 20) {
  const source = text.trim();
  if (!source) return "";
  const first =
    source.split(/[，,。；;：:！？!?\n]/).find((part) => part.trim())?.trim() ??
    source;
  return first.length > limit ? first.slice(0, limit) + "…" : first;
}

export function StagePreviewPanel({
  stage,
}: {
  stage: {
    id: string;
    status: string;
    deliverable: string;
    nextStage: StagePreview | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"generate" | "confirm" | null>(null);
  const [error, setError] = useState("");

  async function submit(kind: "generate" | "confirm") {
    if (pending) return;
    setPending(kind);
    setError("");
    try {
      const formData = new FormData();
      formData.set("stageId", stage.id);
      if (kind === "generate") {
        await generateStagePreviewAction(formData);
      } else {
        await confirmStagePreviewAction(formData);
      }
      router.refresh();
    } catch {
      setError("这次没有接上，再试一次");
    } finally {
      setPending(null);
    }
  }

  if (stage.status !== "ready") {
    // 当前阶段进行中：给总结版——这一步在做什么、下一步会推进成什么样。
    const current =
      stage.nextStage?.currentSummary || shortLine(stage.deliverable);
    const next = stage.nextStage?.nextSummary || "";
    return (
      <div className="mt-3 space-y-2">
        {/* 正在推进的是当前阶段，用强调色；下一阶段只是预告，保持中性 */}
        <div className="rounded-xl border border-accent/25 bg-accent-soft/60 px-3 py-2">
          <span className="text-[11px] font-medium text-accent-strong">
            当前阶段
          </span>
          <p className="mt-0.5 text-xs leading-relaxed text-ink">
            {current || "正在整理当前阶段"}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface-muted/40 px-3 py-2">
          <span className="text-[11px] font-medium text-ink-muted">
            下一阶段
          </span>
          <p className="mt-0.5 text-xs leading-relaxed text-ink">
            {next || "正在整理下一阶段"}
          </p>
        </div>
      </div>
    );
  }

  if (!stage.nextStage) {
    return (
      <div className="mt-3 rounded-xl border border-success/25 bg-success/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-success">当前阶段任务已完成</p>
            <p className="mt-1 text-xs text-ink-muted">
              生成一份简短的下一阶段预览，确认后再进入。
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(pending)}
            onClick={() => void submit("generate")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "generate" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            生成下一阶段预览
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-success/25 bg-success/5">
      <div className="p-4">
        <p className="text-xs font-semibold text-success">下一阶段</p>
        <p className="mt-2 text-sm font-medium leading-6 text-ink">
          {stage.nextStage.nextMilestone}
        </p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          {stage.nextStage.reason}
        </p>
        {stage.nextStage.tasks.length ? (
          <div className="mt-3 space-y-1.5 border-t border-success/15 pt-3">
            {stage.nextStage.tasks.slice(0, 3).map((task, index) => (
              <div key={`${task.title}-${index}`} className="flex gap-2 text-xs leading-5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success/70" />
                <span className="min-w-0">
                  <span className="block text-ink">{task.title}</span>
                  <span className="block text-ink-muted">{task.doneWhen}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={Boolean(pending)}
            onClick={() => void submit("generate")}
            className="text-xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            重新生成
          </button>
          <button
            type="button"
            disabled={Boolean(pending)}
            onClick={() => void submit("confirm")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "confirm" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
            进入下一阶段
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
