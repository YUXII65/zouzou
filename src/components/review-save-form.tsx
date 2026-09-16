"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveReview } from "@/app/actions";

const inputClass =
  "zouzou-input w-full resize-y rounded-xl px-4 py-3 text-[15px] leading-7 tracking-[0.01em] text-ink";

export function ReviewSaveForm({
  reviewId,
  summary,
  nextActions,
  savedAlready,
}: {
  reviewId: string;
  summary: string;
  nextActions: string;
  savedAlready: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(savedAlready);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage("");
    try {
      const result = await saveReview(new FormData(event.currentTarget));
      if (result?.date) {
        setSaved(true);
        setMessage("已保存，正在刷新");
        router.refresh();
      } else {
        setMessage("没有保存成功，再试一次");
      }
    } catch {
      setMessage("没有保存成功，再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    setSaved(savedAlready);
    if (savedAlready) setMessage("");
  }, [savedAlready, reviewId]);

  return (
    <form onSubmit={submit} className="space-y-5 p-5">
      <input type="hidden" name="id" value={reviewId} />
      <label className="block">
        <span className="mb-2 block text-xs font-medium text-ink-secondary">
          当日总结
        </span>
        <textarea
          name="summary"
          required
          rows={7}
          defaultValue={summary}
          onChange={() => {
            setSaved(false);
            setMessage("");
          }}
          className={`${inputClass} min-h-44`}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs font-medium text-ink-secondary">
          下一步任务（1-3 条）
        </span>
        <textarea
          name="nextActions"
          rows={5}
          defaultValue={nextActions}
          onChange={() => {
            setSaved(false);
            setMessage("");
          }}
          className={`${inputClass} min-h-32`}
        />
      </label>
      <div className="flex items-center justify-end gap-3">
        {message ? (
          <span className="text-xs text-ink-muted">{message}</span>
        ) : null}
        <button
          type="submit"
          disabled={submitting || saved}
          className="zouzou-primary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitting ? "保存中..." : saved ? "保存成功" : "保存复盘"}
        </button>
      </div>
    </form>
  );
}
