"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import { ReviewDateField } from "@/components/review-date-field";
import { useRotatingText } from "@/components/rotating-text";
import { consumeAiStream } from "@/lib/ai-stream-client";

const WAITING_LABELS = [
  "正在回看这一天的任务...",
  "正在分清完成和卡点...",
  "正在写明天的方向...",
  "快写好了...",
];

type ReviewDraftResult = {
  reviewId: string;
  date: string;
};

export function ReviewDraftGenerator({
  defaultDate,
}: {
  defaultDate: string;
}) {
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const waitingLabel = useRotatingText(pending, WAITING_LABELS);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    const reviewDate = String(formData.get("reviewDate") ?? defaultDate);
    setPending(true);
    setPreview("");
    setError("");

    try {
      const response = await fetch("/api/ai/review/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewDate }),
      });
      const result = await consumeAiStream<ReviewDraftResult>(
        response,
        setPreview,
      );
      router.replace(`/review?date=${encodeURIComponent(result.date)}`);
    } catch {
      setError("这次没有整理出来，再试一次");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <ReviewDateField defaultValue={defaultDate} />
      <button
        type="submit"
        disabled={pending}
        className="zouzou-primary-button inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CalendarDays className="size-4" />
        )}
        {pending ? waitingLabel : "生成复盘"}
      </button>

      {pending || preview ? (
        <div className="rounded-xl border border-accent/15 bg-surface p-4 text-sm leading-7 text-ink-secondary">
          {preview ? (
            <span className="whitespace-pre-wrap">
              {preview}
              <span
                className="ml-0.5 inline-block animate-pulse text-accent"
                aria-hidden
              >
                |
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-ink-muted">
              <span className="flex gap-1">
                <span className="size-1.5 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-accent/60" />
                <span className="size-1.5 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-accent/60 [animation-delay:150ms]" />
                <span className="size-1.5 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-accent/60 [animation-delay:300ms]" />
              </span>
              {waitingLabel}
            </span>
          )}
        </div>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </form>
  );
}
