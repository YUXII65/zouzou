"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  getTaskEditSuggestion,
  recordEditSuggestionApplied,
} from "@/app/actions";
import { useRotatingText } from "@/components/rotating-text";
import { TypewriterText } from "@/components/typewriter-text";
import type { TaskEditSuggestion } from "@/lib/ai";

const WAITING_LABELS = [
  "正在读你对任务的补充...",
  "正在判断哪里需要改...",
  "正在写修改建议...",
];

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2 text-sm leading-6 text-ink";

function setField(id: string, value: string | null | undefined) {
  const field = document.getElementById(id) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | null;
  if (!field) return;
  field.value = value ?? "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export function AiTaskEditAssistant({
  fieldPrefix,
  taskId,
}: {
  fieldPrefix: string;
  taskId: string;
}) {
  const [idea, setIdea] = useState("");
  const [suggestion, setSuggestion] = useState<TaskEditSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const waitingLabel = useRotatingText(loading, WAITING_LABELS);

  async function generate() {
    if (!idea.trim()) return;
    setLoading(true);
    try {
      const input = {
        taskId,
        title:
          (document.getElementById(`task-title-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? "",
        shortTitle:
          (document.getElementById(`task-short-title-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? "",
        notes:
          (document.getElementById(`task-notes-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? null,
        priority:
          (document.getElementById(`task-priority-${fieldPrefix}`) as HTMLSelectElement)
            ?.value ?? "medium",
        scheduledDate:
          (document.getElementById(`task-scheduled-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? null,
        dueDate:
          (document.getElementById(`task-due-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? null,
        focusDate:
          (document.getElementById(`task-focus-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? null,
        idea,
      };
      const next = await getTaskEditSuggestion(input);
      setSuggestion(next);
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!suggestion) return;
    const beforeJson = JSON.stringify({
      title:
        (document.getElementById(`task-title-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? "",
      shortTitle:
        (document.getElementById(`task-short-title-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? "",
      notes:
        (document.getElementById(`task-notes-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? null,
      priority:
        (document.getElementById(`task-priority-${fieldPrefix}`) as HTMLSelectElement)
          ?.value ?? "medium",
      scheduledDate:
        (document.getElementById(`task-scheduled-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? null,
      dueDate:
        (document.getElementById(`task-due-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? null,
      focusDate:
        (document.getElementById(`task-focus-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? null,
    });
    void recordEditSuggestionApplied({
      source: "task_edit",
      taskId,
      beforeJson,
      afterJson: JSON.stringify(suggestion),
      detail: suggestion.reason,
    });
    setField(`task-title-${fieldPrefix}`, suggestion.title);
    setField(`task-short-title-${fieldPrefix}`, suggestion.shortTitle);
    setField(`task-notes-${fieldPrefix}`, suggestion.notes);
    setField(`task-priority-${fieldPrefix}`, suggestion.priority);
    setField(`task-scheduled-${fieldPrefix}`, suggestion.scheduledDate);
    setField(`task-due-${fieldPrefix}`, suggestion.dueDate);
    setField(`task-focus-${fieldPrefix}`, suggestion.focusDate);
  }

  return (
    <div className="rounded-lg bg-accent-soft/50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
        <Sparkles className="size-3.5 text-accent" />
        AI 修改建议
      </div>
      <textarea
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        rows={2}
        placeholder="输入一个想法，例如：这个任务应该更聚焦到本周能完成的范围。"
        className={`${inputClass} mt-2`}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!idea.trim() || loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="size-3.5" />
          {loading ? waitingLabel : "让 AI 给修改建议"}
        </button>
      </div>

      {suggestion ? (
        <div className="mt-3 rounded-lg bg-surface p-3">
          <p className="text-sm leading-6 text-ink">
            <TypewriterText text={suggestion.reason} />
          </p>
          <button
            type="button"
            onClick={apply}
            className="zouzou-primary-button mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
          >
            <Check className="size-3.5" />
            应用建议
          </button>
        </div>
      ) : null}
    </div>
  );
}
