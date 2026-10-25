"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import {
  CheckinEntryForm,
  CheckinItemToggle,
} from "@/components/checkin-controls";
import type { CheckinTodayView } from "@/lib/checkin";

export function CheckinTodayPanel({
  checkin,
}: {
  checkin: CheckinTodayView;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-mode-checkin/25 bg-surface/75 shadow-card backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-mode-checkin/15 bg-mode-checkin-soft/50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-mode-checkin" />
          <h2 className="truncate text-sm font-semibold text-ink">
            今日打卡
          </h2>
          <span className="shrink-0 text-xs text-ink-muted">
            {checkin.completed}/{checkin.total}
          </span>
        </div>
        <Link
          href={`/files?project=${checkin.projectId}`}
          className="shrink-0 text-xs font-medium text-mode-checkin-ink hover:text-mode-checkin"
        >
          打开
        </Link>
      </div>
      <div className="space-y-0.5 p-2">
        {checkin.items.map((item) => (
          <CheckinItemToggle
            key={item.id}
            taskId={item.id}
            title={item.title}
            completed={item.completed}
          />
        ))}
      </div>
      <div className="border-t border-mode-checkin/15 px-4 py-2">
        <CheckinEntryForm projectId={checkin.projectId} compact />
      </div>
    </section>
  );
}
