"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ChatClarify } from "@/components/chat-clarify";
import { ignoreInboxItem } from "@/app/actions";
import { consumeAiStream } from "@/lib/ai-stream-client";
import type {
  InboxClarification as InboxClarificationData,
  InboxClarificationDimension,
  InboxClarificationFrame,
  InboxClarificationHistoryItem,
  InboxPlan,
} from "@/lib/ai";

type ConfirmResult = {
  ok: true;
  projectId: string | null;
  attachedTaskId: string | null;
  showProjectHint: boolean;
  directAnswer?: string | null;
};

export function InboxClarification({
  itemId,
  content,
  dimensions,
  supplementPlaceholder,
  mode,
  status,
  history = [],
  frame = null,
}: {
  itemId: string;
  content: string;
  dimensions: InboxClarificationDimension[];
  supplementPlaceholder: string;
  mode?: "socratic";
  status?: "asking" | "done";
  history?: InboxClarificationHistoryItem[];
  frame?: InboxClarificationFrame | null;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [storageReady, setStorageReady] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmResult | null>(null);
  const [directAnswer, setDirectAnswer] = useState<string | null>(null);
  const [ignored, setIgnored] = useState(false);
  const [error, setError] = useState("");
  const completionStartedRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setApiKey(localStorage.getItem("ai-api-key") ?? "");
      setModel(localStorage.getItem("ai-model") ?? "deepseek-v4-flash");
      setBaseUrl(
        localStorage.getItem("ai-base-url") ?? "https://api.deepseek.com",
      );
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const finalize = useCallback(async () => {
    // 澄清一旦结束就自动整理，不给用户再点一次「生成任务」。
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    setFinalizing(true);
    setDirectAnswer(null);
    setError("");

    try {
      const response = await fetch("/api/ai/inbox/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          autoConfirm: true,
          apiKey,
          model,
          baseUrl,
        }),
      });
      const plan = await consumeAiStream<InboxPlan>(response, () => {});
      if (!plan) throw new Error("missing_plan");

      if (plan.source === "agent_failed") {
        completionStartedRef.current = false;
        setError("方案没有生成完整。可以先点“重试”；如果连续失败，去个人页检查 DeepSeek 连接。");
        return;
      }
      if (plan.source === "heuristic_fallback") {
        completionStartedRef.current = false;
        setError("AI 这次没有接上，方案没有自动保存。可以先点“重试”；如果连续失败，去个人页检查 DeepSeek 连接。");
        return;
      }
      if (plan.action === "answer" || plan.responseMode === "answer") {
        const answer =
          plan.directAnswer?.trim() ||
          plan.userCard?.how ||
          plan.userCard?.understanding ||
          "";
        if (!answer) throw new Error("missing_answer");
        setDirectAnswer(answer);
      } else if (plan.action === "ignore" || !plan.tasks.length) {
        const formData = new FormData();
        formData.set("id", itemId);
        await ignoreInboxItem(formData);
        setIgnored(true);
        return;
      }

      const confirmResponse = await fetch("/api/ai/inbox/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const confirmedPayload = (await confirmResponse.json()) as {
        result?: ConfirmResult;
      };
      if (!confirmResponse.ok || !confirmedPayload.result?.ok) {
        throw new Error("confirm_failed");
      }
      setConfirmed(confirmedPayload.result);
    } catch {
      completionStartedRef.current = false;
      setError("整理没完成。点“重试”；如果连续失败，去个人页检查 DeepSeek 连接。");
    } finally {
      setFinalizing(false);
    }
  }, [apiKey, baseUrl, itemId, model]);

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
      status:
        clarification.status === "done"
          ? ("done" as const)
          : ("asking" as const),
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
    };
  }

  const fileHref = confirmed?.attachedTaskId
    ? `/files?edit=${confirmed.attachedTaskId}`
    : confirmed?.projectId
      ? `/files?project=${confirmed.projectId}`
      : "/files";

  return (
    <div className="space-y-3">
      <ChatClarify
        userMessage={content}
        dimensions={dimensions}
        supplementPlaceholder={supplementPlaceholder}
        initialHistory={history}
        clarificationStatus={status}
        frame={frame}
        autoSubmit={storageReady}
        hideSubmitAction
        onNext={mode === "socratic" ? next : undefined}
        busy={finalizing}
        onSubmit={finalize}
      />

      {finalizing ? (
        <div className="flex items-center gap-2 px-1 pt-1 text-sm text-ink-muted">
          <Loader2 className="size-4 shrink-0 animate-spin text-accent/70" />
          <span>正在整理到文件页...</span>
        </div>
      ) : null}

      {directAnswer ? (
        <div className="rounded-xl border border-accent/20 bg-accent-soft/30 px-4 py-4 text-sm leading-7 text-ink-secondary">
          <p className="whitespace-pre-wrap">{directAnswer}</p>
        </div>
      ) : null}

      {confirmed && !directAnswer ? (
        <div className="flex justify-end pt-1">
          <Link
            href={fileHref}
            className="zouzou-primary-button inline-flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            查看
          </Link>
        </div>
      ) : null}

      {ignored ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/70 px-4 py-3 text-sm text-ink-secondary">
          <span>这条先收着，没有生成任务。</span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="text-sm font-medium text-accent-strong transition-colors hover:text-accent"
          >
            继续记录
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void finalize()}
            className="font-medium underline underline-offset-4"
          >
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}
