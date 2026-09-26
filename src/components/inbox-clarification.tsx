"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ChatClarify } from "@/components/chat-clarify";
import { consumeAiStream } from "@/lib/ai-stream-client";
import type {
  InboxClarification as InboxClarificationData,
  InboxClarificationDimension,
  InboxClarificationFrame,
  InboxClarificationHistoryItem,
  InboxClarificationSummary,
  InboxPlan,
} from "@/lib/ai";

function formatSummary(summary?: InboxClarificationSummary | null) {
  if (!summary) return "";
  const confirmed = [
    ...summary.confirmedFacts,
    ...summary.valueJudgments,
    ...summary.goals,
  ]
    .filter(Boolean)
    .slice(0, 3);
  const assumption = [
    summary.workingAssumption,
    ...summary.unverifiedAssumptions,
    summary.keyVariable,
  ].find(Boolean);

  return [
    `我目前的判断：${summary.realProblem}`,
    confirmed.length ? `已经确认：${confirmed.join("；")}` : "",
    assumption ? `先按这个假设往下走：${assumption}` : "",
    summary.ifWrongThen ? `如果它不成立：${summary.ifWrongThen}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function InboxClarification({
  itemId,
  content,
  dimensions,
  supplementPlaceholder,
  mode,
  status,
  history = [],
  summary = null,
  frame = null,
}: {
  itemId: string;
  content: string;
  dimensions: InboxClarificationDimension[];
  supplementPlaceholder: string;
  mode?: "socratic";
  status?: "asking" | "done";
  history?: InboxClarificationHistoryItem[];
  summary?: InboxClarificationSummary | null;
  frame?: InboxClarificationFrame | null;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [pending, setPending] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setApiKey(localStorage.getItem("ai-api-key") ?? "");
      setModel(localStorage.getItem("ai-model") ?? "deepseek-v4-flash");
      setBaseUrl(
        localStorage.getItem("ai-base-url") ?? "https://api.deepseek.com",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function next(payload: {
    answer: string[];
    history: InboxClarificationHistoryItem[];
  }) {
    setError("");
    const response = await fetch("/api/ai/inbox/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId,
        mode: "socratic",
        answer: payload.answer,
        apiKey,
        model,
        baseUrl,
      }),
    });
    const result = await consumeAiStream<{
      itemId: string;
      clarification: InboxClarificationData;
    }>(response, () => {});
    const clarification = result.clarification;
    const current = clarification.history?.at(-1);
    return {
      status: clarification.status === "done" ? ("done" as const) : ("asking" as const),
      question:
        clarification.status === "done" || !current
          ? null
          : {
              key: current.key,
              question: current.question,
              options: current.options,
              multi: current.multi,
            },
      reflection: current?.reflection ?? null,
      summaryText: formatSummary(clarification.summary),
    };
  }

  async function submit(payload: { answers: string[][]; supplement: string }) {
    if (pending) return;
    setPending(true);
    setPlanReady(false);
    setError("");
    try {
      const response = await fetch("/api/ai/inbox/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          option: payload.answers[0]?.join("、") ?? "",
          dimensionChoices: payload.answers.map((group) => group.join("、")),
          supplement: payload.supplement,
          apiKey,
          model,
          baseUrl,
        }),
      });
      await consumeAiStream<InboxPlan>(response, () => {});
      setPlanReady(true);
      router.refresh();
      window.setTimeout(() => setPlanReady(false), 4000);
    } catch {
      setError("这次没有整理出来，再试一次");
    } finally {
      setPending(false);
    }
  }

  const hasSocraticState = mode === "socratic";
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-ink">{content}</p>
      {hasSocraticState || dimensions.length ? (
        <ChatClarify
          dimensions={dimensions}
          supplementPlaceholder={supplementPlaceholder}
          initialHistory={history}
          clarificationStatus={status}
          summaryText={formatSummary(summary)}
          frame={frame}
          onNext={hasSocraticState ? next : undefined}
          busy={pending || planReady}
          submitLabel="就是这个问题，给我下一步"
          onSubmit={submit}
        />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit({ answers: [], supplement: "" });
          }}
          className="zouzou-panel rounded-xl p-4"
        >
          <p className="text-sm leading-6 text-ink">
            没有需要补充的问题，直接生成下一步。
          </p>
          <button
            type="submit"
            disabled={pending || planReady}
            className="zouzou-primary-button mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="size-4" />
            {pending || planReady ? "正在整理..." : "给我下一步"}
          </button>
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </form>
      )}
    </div>
  );
}
