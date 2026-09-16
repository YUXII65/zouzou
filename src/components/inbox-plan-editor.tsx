"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { confirmInboxPlan } from "@/app/actions";
import type { InboxPlan } from "@/lib/ai";

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2 text-sm leading-6 text-ink";

export function InboxPlanEditor({
  itemId,
  plan,
}: {
  itemId: string;
  plan: InboxPlan;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const router = useRouter();
  const showProjectFields =
    plan.action !== "single_task" || Boolean(plan.projectName);

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await confirmInboxPlan(new FormData(event.currentTarget));
      router.refresh();
    } catch {
      setSubmitError("没生成成功，再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitPlan} className="mt-3 space-y-3">
      <input type="hidden" name="id" value={itemId} />

      {showProjectFields ? (
        <div className="rounded-lg border border-accent/20 bg-accent-soft/50 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="mb-1.5 block text-xs font-medium text-accent-strong">
                项目名称
              </span>
              <input
                name="projectName"
                defaultValue={plan.projectName ?? ""}
                placeholder="项目名称"
                className={inputClass}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-accent-strong">
                项目目标
              </span>
              <input
                name="projectObjective"
                defaultValue={plan.projectObjective ?? ""}
                placeholder="希望达到什么结果"
                className={inputClass}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {plan.tasks.map((task, index) => (
          <div
            key={`${task.title}-${index}`}
            className="zouzou-panel rounded-xl bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-medium text-white">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-ink">
                  任务 {index + 1}
                </span>
              </div>
              <span className="text-xs text-ink-muted">可执行步骤</span>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                标题
              </span>
              <input
                name={`tasks[${index}].title`}
                defaultValue={task.title}
                className={`${inputClass} font-medium text-ink`}
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                精简标题
              </span>
              <input
                name={`tasks[${index}].shortTitle`}
                defaultValue={task.shortTitle}
                placeholder="列表展示时使用的短标题"
                className={inputClass}
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                执行说明
              </span>
              <textarea
                name={`tasks[${index}].notes`}
                defaultValue={task.notes ?? ""}
                rows={2}
                className={inputClass}
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  优先级
                </span>
                <select
                  name={`tasks[${index}].priority`}
                  defaultValue={task.priority}
                  className={inputClass}
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="urgent">紧急</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  计划日期
                </span>
                <input
                  name={`tasks[${index}].scheduledDate`}
                  type="date"
                  defaultValue={task.scheduledDate ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  截止日期
                </span>
                <input
                  name={`tasks[${index}].dueDate`}
                  type="date"
                  defaultValue={task.dueDate ?? ""}
                  className={inputClass}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-accent-soft/60 p-3 text-sm leading-6 text-ink-secondary">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-1 size-4 shrink-0 text-accent" />
          <span>{plan.reason}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {submitError ? (
          <p className="text-xs text-danger">{submitError}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="zouzou-primary-button inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {submitting ? "正在生成..." : "生成任务"}
        </button>
      </div>
    </form>
  );
}
