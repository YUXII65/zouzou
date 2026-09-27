"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setTaskStatus } from "@/app/actions";
import { markFirstTaskGroupDone, notifyTourStep } from "@/lib/first-run-hints";
import { trackEvent } from "@/lib/track";

const STATUS_OPTIONS = [
  { value: "todo", label: "待办" },
  { value: "in_progress", label: "进行" },
  { value: "done", label: "完成" },
] as const;

function activeClass(value: string) {
  if (value === "done") return "bg-success/15 text-success";
  if (value === "in_progress") return "bg-accent-soft text-accent-strong";
  return "bg-surface-muted text-ink";
}

/**
 * 任务行右侧只留三个状态按钮：待办 / 进行 / 完成。
 * 不再显示状态徽章、便利贴按钮和设置菜单——便利贴点开任务就能看，编辑删除也在展开区里。
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

  async function change(next: string) {
    if (updating || next === current) return;
    const previous = current;
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
      router.refresh();
    } catch {
      setCurrent(previous);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div
      role="group"
      aria-label="任务状态"
      className="inline-flex overflow-hidden rounded-lg border border-border bg-surface"
    >
      {STATUS_OPTIONS.map((option) => {
        const active = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            data-tour={option.value === "in_progress" ? "task-next" : undefined}
            onClick={() => void change(option.value)}
            disabled={updating}
            aria-pressed={active}
            className={`inline-flex h-8 items-center justify-center px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? activeClass(option.value)
                : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
            }`}
          >
            {updating && active ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
