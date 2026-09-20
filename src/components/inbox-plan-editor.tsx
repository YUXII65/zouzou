"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { confirmInboxPlan } from "@/app/actions";
import { TypewriterText } from "@/components/typewriter-text";
import type { InboxPlan } from "@/lib/ai";

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2 text-sm leading-6 text-ink";

const executionModeOptions = [
  { value: "quick", label: "直接完成" },
  { value: "tool", label: "查资料" },
  { value: "produce", label: "做产物" },
  { value: "explore", label: "做验证" },
  { value: "project", label: "长期推进" },
];

type ConfirmResult = {
  ok: true;
  projectId: string | null;
  showProjectHint: boolean;
};

export function InboxPlanEditor({
  itemId,
  plan,
}: {
  itemId: string;
  plan: InboxPlan;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const router = useRouter();

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = (await confirmInboxPlan(
        new FormData(event.currentTarget),
      )) as ConfirmResult | undefined;
      if (result?.showProjectHint) {
        setConfirmResult(result);
        return;
      }
      router.refresh();
    } catch {
      setSubmitError("没生成成功，再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmResult) {
    return (
      <div className="rounded-xl border border-success/25 bg-success/10 p-4">
        <p className="text-sm font-semibold text-success">
          项目已整理，去书桌页查看并推进
        </p>
        <Link
          href={
            confirmResult.projectId
              ? `/workspace?project=${confirmResult.projectId}`
              : "/workspace"
          }
          className="zouzou-primary-button mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          去书桌页
          <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submitPlan} className="mt-3 space-y-3">
      <input type="hidden" name="id" value={itemId} />

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
            </div>

            <input
              type="hidden"
              name={`tasks[${index}].shortTitle`}
              value={task.shortTitle}
            />
            <input
              type="hidden"
              name={`tasks[${index}].scheduledDate`}
              value={task.scheduledDate ?? ""}
            />

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
                内容
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
                  执行
                </span>
                <select
                  name={`tasks[${index}].executionMode`}
                  defaultValue={task.executionMode}
                  className={inputClass}
                >
                  {executionModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
          <TypewriterText text={plan.reason} />
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
