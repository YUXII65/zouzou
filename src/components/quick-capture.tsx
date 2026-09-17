"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { InboxClarification } from "@/components/inbox-clarification";
import { useRotatingText } from "@/components/rotating-text";
import {
  markFirstAiQuestionAsked,
  notifyTourStep,
} from "@/lib/first-run-hints";
import { consumeAiStream } from "@/lib/ai-stream-client";
import { trackEvent } from "@/lib/track";
import {
  pickRandomSampleIdeas,
  sampleIdeasForDate,
} from "@/lib/sample-ideas";
import type { InboxClarification as InboxClarificationData } from "@/lib/ai";

type CaptureResult = {
  itemId: string;
  content: string;
  clarification: InboxClarificationData;
};

const CAPTURE_WAITING_LABELS = [
  "正在读你的原话...",
  "正在找最关键的问题...",
  "正在把选项写具体...",
  "快整理好了...",
];

export function QuickCapture({
  compact = false,
  pendingIds = [],
}: {
  compact?: boolean;
  pendingIds?: string[];
}) {
  const [content, setContent] = useState("");
  const [samples, setSamples] = useState(sampleIdeasForDate);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [localResult, setLocalResult] = useState<CaptureResult | null>(null);
  const [pendingContent, setPendingContent] = useState("");
  const [streamPreview, setStreamPreview] = useState("");
  const router = useRouter();
  const waitingLabel = useRotatingText(submitting, CAPTURE_WAITING_LABELS);

  useEffect(() => {
    if (localResult && pendingIds.includes(localResult.itemId)) {
      setLocalResult(null);
    }
  }, [localResult, pendingIds]);

  useEffect(() => {
    function readStorage() {
      setApiKey(localStorage.getItem("ai-api-key") ?? "");
      setModel(localStorage.getItem("ai-model") ?? "deepseek-v4-flash");
      setBaseUrl(
        localStorage.getItem("ai-base-url") ?? "https://api.deepseek.com",
      );
    }

    function onKeyUpdated() {
      readStorage();
    }

    const timer = window.setTimeout(readStorage, 0);
    window.addEventListener("ai-key-updated", onKeyUpdated);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ai-key-updated", onKeyUpdated);
    };
  }, []);

  function refreshSamples() {
    setSamples(pickRandomSampleIdeas());
    trackEvent("home_sample_refresh");
  }

  async function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const idea = content.trim();
    if (!idea) return;

    setSubmitting(true);
    setSubmitError("");
    setLocalResult(null);
    setPendingContent(idea);
    setStreamPreview("");
    setContent("");
    markFirstAiQuestionAsked();
    notifyTourStep("2");
    trackEvent("home_ai_input_submit");

    try {
      const response = await fetch("/api/ai/inbox/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: idea, apiKey, model, baseUrl }),
      });
      const result = await consumeAiStream<CaptureResult>(
        response,
        setStreamPreview,
      );
      setLocalResult(result);
      router.refresh();
    } catch {
      setSubmitError("没送出去，再试一次");
      setContent(idea);
    } finally {
      setSubmitting(false);
      setPendingContent("");
      setStreamPreview("");
    }
  }

  return (
    <>
    <form
      data-tour="quick-capture"
      className="relative overflow-hidden rounded-xl border border-accent/15 bg-gradient-to-br from-accent-soft/80 via-surface to-ai-soft/60 p-4 sm:p-5"
      onSubmit={submitCapture}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-accent/10 blur-3xl"
      />
      <label className="sr-only" htmlFor="quick-capture">
        快速记录
      </label>
      <textarea
        id="quick-capture"
        name="content"
        required
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={compact ? 4 : 6}
        placeholder="今天脑子里在转什么？直接倒出来"
        className="zouzou-input relative min-h-40 w-full resize-none border-accent/20 bg-surface/90 px-4 py-3 text-base leading-7 text-ink shadow-sm"
      />
      <div className="relative mt-3 flex flex-wrap gap-2">
        {samples.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => setContent(sample)}
            className="max-w-full truncate rounded-full border border-border/80 bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/30 hover:bg-accent-soft hover:text-accent-strong"
          >
            {sample}
          </button>
        ))}
      </div>
      <div className="relative mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={refreshSamples}
          aria-label="换一批示例想法"
          title="换一批示例想法"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface/90 px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/30 hover:text-accent-strong"
        >
          <RefreshCw className="size-3.5" />
          换一批
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="zouzou-primary-button inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {submitting ? waitingLabel : "下一步"}
        </button>
      </div>
      {submitError ? (
        <p className="relative mt-3 text-xs text-danger">{submitError}</p>
      ) : null}
    </form>
    {pendingContent ? (
      <div className="mt-4 rounded-xl border border-accent/15 bg-surface p-4">
        <p className="text-sm leading-6 text-ink">{pendingContent}</p>
        <div className="mt-3 border-l-2 border-accent/30 pl-3 text-sm leading-7 text-ink-secondary">
          {streamPreview ? (
            <span className="whitespace-pre-wrap">
              {streamPreview}
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
      </div>
    ) : null}
    {localResult ? (
      <div className="mt-4">
        <InboxClarification
          itemId={localResult.itemId}
          content={localResult.content}
          dimensions={localResult.clarification.dimensions}
          supplementPlaceholder={localResult.clarification.supplementPlaceholder}
        />
      </div>
    ) : null}
    </>
  );
}
