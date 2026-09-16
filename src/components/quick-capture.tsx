"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { addInboxItemAndClarify } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import {
  markFirstAiQuestionAsked,
  notifyTourStep,
} from "@/lib/first-run-hints";
import { trackEvent } from "@/lib/track";
import {
  pickRandomSampleIdeas,
  sampleIdeasForDate,
} from "@/lib/sample-ideas";

export function QuickCapture({ compact = false }: { compact?: boolean }) {
  const [content, setContent] = useState("");
  const [samples, setSamples] = useState(sampleIdeasForDate);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");

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

  return (
    <form
      action={addInboxItemAndClarify}
      data-tour="quick-capture"
      className="relative overflow-hidden rounded-xl border border-accent/15 bg-gradient-to-br from-accent-soft/80 via-surface to-ai-soft/60 p-4 sm:p-5"
      onSubmit={() => {
        markFirstAiQuestionAsked();
        notifyTourStep("2");
        trackEvent("home_ai_input_submit");
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-accent/10 blur-3xl"
      />
      <input type="hidden" name="apiKey" value={apiKey} />
      <input type="hidden" name="model" value={model} />
      <input type="hidden" name="baseUrl" value={baseUrl} />
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
        <SubmitButton
          pendingText="正在梳理..."
          className="zouzou-primary-button inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-strong sm:w-auto"
        >
          <Sparkles className="size-4" />
          下一步
        </SubmitButton>
      </div>
    </form>
  );
}
