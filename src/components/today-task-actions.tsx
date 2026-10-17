"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Play } from "lucide-react";
import { setTaskStatus } from "@/app/actions";
import { notifyTourStep } from "@/lib/first-run-hints";
import { trackEvent } from "@/lib/track";

const ORDER = ["todo", "in_progress", "done"] as const;

const LABELS: Record<string, string> = {
  todo: "待办",
  in_progress: "进行",
  done: "完成",
};

function nextStatus(status: string) {
  const index = ORDER.indexOf(status as (typeof ORDER)[number]);
  return index === -1 ? ORDER[0] : ORDER[(index + 1) % ORDER.length];
}

function statusClass(status: string, locked: boolean) {
  if (status === "done" || status === "cancelled") {
    return "border-success/30 bg-success/10 text-success";
  }
  if (status === "in_progress") {
    return `border-accent bg-accent-soft text-accent-strong ${
      locked ? "" : "hover:bg-accent/20"
    }`;
  }
  return `border-border bg-surface text-ink-secondary ${
    locked ? "" : "hover:border-accent hover:text-accent"
  }`;
}

function statusIcon(status: string) {
  if (status === "done" || status === "cancelled") {
    return <CheckCircle2 className="size-3.5" />;
  }
  if (status === "in_progress") return <Play className="size-3.5" />;
  return <Circle className="size-3.5" />;
}

/**
 * 任务状态就是一个按钮：待办 → 进行 → 完成，点一下往前走一步。
 * 到「完成」就是终态——按钮锁死，不能再点回去。
 */
export function TodayTaskActions({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setCurrent(status);
  }, [status]);

  const locked = current === "done" || current === "cancelled";

  async function cycle() {
    if (updating || locked) return;
    const previous = current;
    const next = nextStatus(previous);
    if (next === previous) return;
    setCurrent(next);
    setUpdating(true);
    if (next === "in_progress") notifyTourStep("3");
    trackEvent("home_task_status", { status: next });
    try {
      const formData = new FormData();
      formData.set("id", taskId);
      formData.set("status", next);
      await setTaskStatus(formData);
      router.refresh();
      if (next === "done") {
        // 探索项目的下一步是异步续接的，稍后主动刷新一次让新任务出现。
        window.setTimeout(() => router.refresh(), 2400);
        window.setTimeout(() => router.refresh(), 8000);
        window.setTimeout(() => router.refresh(), 16000);
      }
    } catch {
      setCurrent(previous);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <button
      type="button"
      data-tour="task-next"
      onClick={() => void cycle()}
      disabled={updating || locked}
      aria-label={
        locked
          ? `任务状态：${LABELS[current] ?? current}，已完成`
          : `任务状态：${LABELS[current] ?? current}，点击切换`
      }
      className={`inline-flex h-8 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
        locked ? "cursor-default" : "cursor-pointer"
      } ${statusClass(current, locked)} disabled:cursor-default disabled:opacity-100`}
    >
      {updating ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        statusIcon(current)
      )}
      {LABELS[current] ?? current}
    </button>
  );
}
