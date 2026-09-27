"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, Play } from "lucide-react";
import { setTaskStatus } from "@/app/actions";
import { markFirstTaskGroupDone, notifyTourStep } from "@/lib/first-run-hints";
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

function statusClass(status: string) {
  if (status === "done") {
    return "border-success/30 bg-success/10 text-success hover:bg-success/20";
  }
  if (status === "in_progress") {
    return "border-accent bg-accent-soft text-accent-strong hover:bg-accent/20";
  }
  return "border-border bg-surface text-ink-secondary hover:border-accent hover:text-accent";
}

function statusIcon(status: string) {
  if (status === "done") return <CheckCircle2 className="size-3.5" />;
  if (status === "in_progress") return <Play className="size-3.5" />;
  return <Circle className="size-3.5" />;
}

/**
 * 任务状态就是一个按钮：点一下在 待办 → 进行 → 完成 之间循环，
 * 字样和颜色跟着当前状态变。不要拆成三个并排按钮。
 */
export function TodayTaskActions({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const [current, setCurrent] = useState(status);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setCurrent(status);
  }, [status]);

  async function cycle() {
    if (updating) return;
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
      const result = await setTaskStatus(formData);
      if (result?.reviewHintEligible) markFirstTaskGroupDone();
      // 这里不 router.refresh()：刷新会让「完成」的任务立刻被移出当前列表，
      // 用户就再也点不回来了。保持行在原位，字样和颜色即时切换，下次进入页面再归组。
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
      disabled={updating}
      title="点一下切换：待办 → 进行 → 完成"
      aria-label={`任务状态：${LABELS[current] ?? current}，点击切换`}
      className={`inline-flex h-8 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${statusClass(
        current,
      )}`}
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
