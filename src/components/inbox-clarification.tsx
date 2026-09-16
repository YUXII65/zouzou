"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { generateInboxPlan } from "@/app/actions";
import { ChatClarify } from "@/components/chat-clarify";
import type { InboxClarificationDimension } from "@/lib/ai";

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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setApiKey(localStorage.getItem("ai-api-key") ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function submit(payload: { answers: string[][]; supplement: string }) {
    const formData = new FormData();
    formData.set("id", itemId);
    formData.set("option", payload.answers[0]?.join("、") ?? "");
    payload.answers.forEach((group, index) => {
      formData.set(`choice_${index}`, group.join("、"));
    });
    formData.set("supplement", payload.supplement);
    formData.set("apiKey", apiKey);
    startTransition(async () => {
      await generateInboxPlan(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-ink">{content}</p>
      <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-ink-secondary">
        <Sparkles className="size-3.5 text-accent" />
        推进伙伴想先多了解一点
      </div>
      {dimensions.length ? (
        <ChatClarify
          dimensions={dimensions}
          supplementPlaceholder={supplementPlaceholder}
          busy={pending}
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
        </form>
      )}
    </div>
  );
}
