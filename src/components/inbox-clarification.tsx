"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ChatClarify } from "@/components/chat-clarify";
import { InboxPlanEditor } from "@/components/inbox-plan-editor";
import { consumeAiStream } from "@/lib/ai-stream-client";
import type {
  InboxClarificationDimension,
  InboxPlan,
} from "@/lib/ai";

export function InboxClarification({
  itemId,
  content,
  dimensions,
  supplementPlaceholder,
}: {
  itemId: string;
  content: string;
  dimensions: InboxClarificationDimension[];
  supplementPlaceholder: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [localPlan, setLocalPlan] = useState<InboxPlan | null>(null);
  const [pending, setPending] = useState(false);
  const [streamPreview, setStreamPreview] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setApiKey(localStorage.getItem("ai-api-key") ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(payload: { answers: string[][]; supplement: string }) {
    if (pending) return;
    setPending(true);
    setError("");
    setStreamPreview("");
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
        }),
      });
      const plan = await consumeAiStream<InboxPlan>(response, setStreamPreview);
      setLocalPlan(plan);
      router.refresh();
    } catch {
      setError("这次没有整理出来，再试一次");
    } finally {
      setPending(false);
      setStreamPreview("");
    }
  }

  if (localPlan) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-ink">{content}</p>
        <InboxPlanEditor itemId={itemId} plan={localPlan} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-ink">{content}</p>
      {dimensions.length ? (
        <ChatClarify
          dimensions={dimensions}
          supplementPlaceholder={supplementPlaceholder}
          busy={pending}
          liveText={streamPreview}
          submitLabel="确定方向，给我下一步"
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
            disabled={pending}
            className="zouzou-primary-button mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="size-4" />
            {pending ? "正在整理..." : "给我下一步"}
          </button>
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </form>
      )}
    </div>
  );
}
