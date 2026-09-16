"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  getProjectEditSuggestion,
  recordEditSuggestionApplied,
} from "@/app/actions";
import type { ProjectEditSuggestion } from "@/lib/ai";

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

export function AiProjectEditAssistant({
  fieldPrefix,
  projectId,
}: {
  fieldPrefix: string;
  projectId: string;
}) {
  const [idea, setIdea] = useState("");
  const [suggestion, setSuggestion] = useState<ProjectEditSuggestion | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!idea.trim()) return;
    setLoading(true);
    try {
      const input = {
        projectId,
        name:
          (document.getElementById(`project-name-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? "",
        objective:
          (document.getElementById(`project-objective-${fieldPrefix}`) as HTMLTextAreaElement)
            ?.value ?? "",
        currentMilestone:
          (document.getElementById(`project-milestone-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? null,
        status:
          (document.getElementById(`project-status-${fieldPrefix}`) as HTMLSelectElement)
            ?.value ?? "active",
        notes:
          (document.getElementById(`project-notes-${fieldPrefix}`) as HTMLInputElement)
            ?.value ?? null,
        idea,
      };
      const next = await getProjectEditSuggestion(input);
      setSuggestion(next);
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!suggestion) return;
    const beforeJson = JSON.stringify({
      name:
        (document.getElementById(`project-name-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? "",
      objective:
        (document.getElementById(`project-objective-${fieldPrefix}`) as HTMLTextAreaElement)
          ?.value ?? "",
      currentMilestone:
        (document.getElementById(`project-milestone-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? null,
      status:
        (document.getElementById(`project-status-${fieldPrefix}`) as HTMLSelectElement)
          ?.value ?? "active",
      notes:
        (document.getElementById(`project-notes-${fieldPrefix}`) as HTMLInputElement)
          ?.value ?? null,
    });
    void recordEditSuggestionApplied({
      source: "project_edit",
      projectId,
      beforeJson,
      afterJson: JSON.stringify(suggestion),
      detail: suggestion.reason,
    });
    setField(`project-name-${fieldPrefix}`, suggestion.name);
    setField(`project-objective-${fieldPrefix}`, suggestion.objective);
    setField(`project-milestone-${fieldPrefix}`, suggestion.currentMilestone);
    setField(`project-status-${fieldPrefix}`, suggestion.status);
    setField(`project-notes-${fieldPrefix}`, suggestion.notes);
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
        placeholder="输入一个想法，例如：这个项目应该先聚焦到内容整理，暂不追求完整上线。"
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
          {loading ? "AI 思考中..." : "让 AI 给修改建议"}
        </button>
      </div>

      {suggestion ? (
        <div className="mt-3 rounded-lg bg-surface p-3">
          <p className="text-sm leading-6 text-ink">{suggestion.reason}</p>
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
