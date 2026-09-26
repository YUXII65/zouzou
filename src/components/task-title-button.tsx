"use client";

import { useEffect, useState } from "react";
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
}: {
  taskId: string;
  title: string;
  shortTitle?: string | null;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
}) {
  const [displayTitle, setDisplayTitle] = useState(shortTitle?.trim() ?? "");

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
      <p className="truncate font-medium text-ink">
        {displayTitle || fallbackTitle(title)}
      </p>
    </div>
  );
}
