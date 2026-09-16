"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ensureTaskShortTitle } from "@/app/actions";

const requestedTitles = new Set<string>();

function fallbackTitle(title: string) {
  const headline = title.split(/[，,。；;！？!\n]/)[0]?.trim() || title;
  return headline.length > 18 ? `${headline.slice(0, 17).trim()}…` : headline;
}

export function TaskTitleButton({
  taskId,
  title,
  shortTitle,
  notes,
  projectName,
  status,
  doneWhen,
}: {
  taskId: string;
  title: string;
  shortTitle?: string | null;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  doneWhen?: string | null;
}) {
  const [displayTitle, setDisplayTitle] = useState(shortTitle?.trim() ?? "");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (shortTitle?.trim()) {
      setDisplayTitle(shortTitle.trim());
      return;
    }
    if (requestedTitles.has(taskId)) return;

    requestedTitles.add(taskId);
    let cancelled = false;
    void ensureTaskShortTitle({
      taskId,
      title,
      notes,
      projectName,
      status,
    })
      .then((result) => {
        if (!cancelled) setDisplayTitle(result.shortTitle);
      })
      .catch(() => {
        if (!cancelled) setDisplayTitle(fallbackTitle(title));
      });

    return () => {
      cancelled = true;
    };
  }, [notes, projectName, shortTitle, status, taskId, title]);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="block max-w-full text-left"
      >
        <p className="truncate font-medium text-ink">
          {displayTitle || fallbackTitle(title)}
        </p>
      </button>

      {expanded ? (
        <div className="mt-2 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-ink">
              {title}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="收起完整任务"
              title="收起"
              className="flex size-5 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {notes && notes !== title ? (
            <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-xs leading-5 text-ink-secondary">
              {notes}
            </p>
          ) : null}
          {doneWhen ? (
            <p className="mt-2 border-t border-border pt-2 text-xs leading-5 text-ink-secondary">
              <span className="font-medium text-ink-muted">完成标准　</span>
              {doneWhen}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
