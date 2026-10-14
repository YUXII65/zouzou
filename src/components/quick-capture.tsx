"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRotatingText } from "@/components/rotating-text";
import {
  markFirstAiQuestionAsked,
  notifyTourStep,
} from "@/lib/first-run-hints";
import { consumeAiStream } from "@/lib/ai-stream-client";
import { trackEvent } from "@/lib/track";
import { cx } from "@/lib/utils";
import { InboxClarification } from "@/components/inbox-clarification";
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
  embedded = false,
  suppressInput = false,
}: {
  compact?: boolean;
  pendingIds?: string[];
  /** 嵌在父级卡片里时不再自带边框和背景，让澄清和输入框看起来是同一个框 */
  embedded?: boolean;
  /** 正在对话（有待澄清的内容或刚提交）时，整块输入让位给澄清 */
  suppressInput?: boolean;
}) {
  const [content, setContent] = useState("");
  const [samples, setSamples] = useState(sampleIdeasForDate);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [settledItemId, setSettledItemId] = useState<string | null>(null);
  const [pendingContent, setPendingContent] = useState("");
  const [streamPreview, setStreamPreview] = useState("");
  // 澄清结果一到就先本地渲染，不等整页刷新（刷新在后台跑，用来把它换成服务端版本）
  const [localClarification, setLocalClarification] = useState<CaptureResult | null>(null);
  const router = useRouter();
  const waitingLabel = useRotatingText(submitting, CAPTURE_WAITING_LABELS);

  useEffect(() => {
    if (settledItemId && pendingIds.includes(settledItemId)) {
      setSettledItemId(null);
      setPendingContent("");
      setStreamPreview("");
      setLocalClarification(null);
    }
  }, [pendingIds, settledItemId]);

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
    setSettledItemId(null);
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
        body: JSON.stringify({
          content: idea,
          mode: "socratic",
          apiKey,
          model,
          baseUrl,
        }),
      });
      // 服务端一边生成一边推「问题 + 选项」的可读文本，接住它，等待时就有真实反馈
      const result = await consumeAiStream<CaptureResult>(
        response,
        (preview) => setStreamPreview(preview),
      );
      setSettledItemId(result.itemId);
      setLocalClarification(result);
      router.refresh();
    } catch {
      setSubmitError("没送出去，再试一次");
      setContent(idea);
      setPendingContent("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    {!suppressInput && !pendingContent ? (
    <form
      data-tour="quick-capture"
      className={cx(
        "relative",
        embedded
          ? ""
          : "overflow-hidden rounded-xl border border-accent/15 bg-gradient-to-br from-accent-soft/80 via-surface to-ai-soft/60 p-4 sm:p-5",
      )}
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
        rows={compact ? 6 : 7}
        placeholder="思考与困惑，计划与执行，直接倒出你的想法"
        className="zouzou-input relative min-h-44 w-full resize-none border-accent/20 bg-surface/90 px-4 py-3 text-base leading-7 text-ink shadow-sm"
      />

      {/* 输入框下方：右下角进入下一步 */}
      <div className="relative mt-2 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="zouzou-primary-button inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {submitting ? waitingLabel : "下一步"}
        </button>
      </div>

      {pendingIds.length === 0 ? (
        <>
          {/* 演示内容：三条竖着排，一行一条 */}
      <div className="relative mt-3 flex flex-col gap-1.5">
        {samples.map((sample) => (
          <button
            key={sample.title}
            type="button"
            onClick={() => setContent(sample.content)}
            className="w-full truncate rounded-lg border border-border/80 bg-surface/90 px-3 py-2 text-left text-xs leading-5 text-ink-secondary transition-colors hover:border-accent/30 hover:bg-accent-soft hover:text-accent-strong"
          >
            {sample.title}
          </button>
        ))}
      </div>

      <div className="relative mt-2 flex justify-end">
        <button
          type="button"
          onClick={refreshSamples}
          aria-label="换一批示例想法"
          title="换一批示例想法"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface hover:text-accent-strong"
        >
          <RefreshCw className="size-3.5" />
          换一批
        </button>
          </div>
        </>
      ) : null}

      {submitError ? (
        <p className="relative mt-3 text-xs text-danger">{submitError}</p>
      ) : null}
    </form>
    ) : null}
    {pendingContent && !(settledItemId && pendingIds.includes(settledItemId)) ? (
      <div className="relative">
        {localClarification ? (
          <InboxClarification
            itemId={localClarification.itemId}
            content={localClarification.content}
            dimensions={localClarification.clarification.dimensions}
            supplementPlaceholder={
              localClarification.clarification.supplementPlaceholder
            }
            mode={localClarification.clarification.mode}
            status={localClarification.clarification.status}
            history={localClarification.clarification.history}

            frame={localClarification.clarification.frame}
          />
        ) : (
          <div className="space-y-3">
            <div className="ml-auto max-w-[82%] rounded-xl rounded-tr-sm border border-border bg-surface-muted px-3 py-2 text-sm font-medium leading-6 text-ink">
              {pendingContent}
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-strong">
                <Sparkles className="size-3.5" />
              </span>
              <div className="rounded-xl rounded-tl-sm border border-border/70 bg-surface px-3 py-2.5 text-sm leading-6 text-ink">
                {streamPreview ? (
                  <p className="whitespace-pre-wrap text-ink-secondary">
                    {streamPreview}
                  </p>
                ) : (
                  <span className="flex items-center gap-2 text-ink-muted">
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-accent/70" />
                    <span>{waitingLabel}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    ) : null}

    </>
  );
}