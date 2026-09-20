import { AiTaskEditAssistant } from "@/components/ai-task-edit-assistant";
import { SubmitButton } from "@/components/submit-button";
import { toDateInputValue } from "@/lib/date";

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2 text-sm text-ink";

const executionModeOptions = [
  { value: "quick", label: "直接完成" },
  { value: "tool", label: "查资料" },
  { value: "produce", label: "做产物" },
  { value: "explore", label: "做验证" },
  { value: "project", label: "长期推进" },
];

type TaskFormTask = {
  id: string;
  title: string;
  notes: string | null;
  projectId: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  scheduledDate: Date | null;
  focusDate: Date | null;
  executionMode?: string | null;
};

export function TaskForm({
  action,
  task,
  defaultProjectId,
  returnTo,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  task?: TaskFormTask;
  defaultProjectId?: string;
  returnTo?: string;
  submitLabel: string;
}) {
  const id = task?.id ?? "new";

  return (
    <form action={action} className="space-y-4 p-4">
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      {returnTo ? (
        <input type="hidden" name="returnTo" value={returnTo} />
      ) : null}
      <input
        type="hidden"
        name="projectId"
        value={task?.projectId ?? defaultProjectId ?? ""}
      />
      <input type="hidden" name="status" value={task?.status ?? "todo"} />
      <input
        type="hidden"
        name="scheduledDate"
        value={task?.scheduledDate ? toDateInputValue(task.scheduledDate) : ""}
      />
      <input
        type="hidden"
        name="focusDate"
        value={task?.focusDate ? toDateInputValue(task.focusDate) : ""}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor={`task-title-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            标题
          </label>
          <input
            id={`task-title-${id}`}
            name="title"
            required
            defaultValue={task?.title}
            placeholder="写清今天要推进的具体动作"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={`task-notes-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            内容
          </label>
          <textarea
            id={`task-notes-${id}`}
            name="notes"
            defaultValue={task?.notes ?? ""}
            rows={3}
            placeholder="补充背景、对象或你现在的想法"
            className={`${inputClass} resize-y`}
          />
        </div>

        {task ? (
          <div className="sm:col-span-2">
            <details className="zouzou-panel rounded-xl bg-surface">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-accent">
                AI 帮助
              </summary>
              <div className="border-t border-border p-3">
                <AiTaskEditAssistant fieldPrefix={id} taskId={task.id} />
              </div>
            </details>
          </div>
        ) : null}

        <div>
          <label
            htmlFor={`task-execution-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            执行
          </label>
          <select
            id={`task-execution-${id}`}
            name="executionMode"
            defaultValue={task?.executionMode ?? "quick"}
            className={inputClass}
          >
            {executionModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`task-priority-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            优先级
          </label>
          <select
            id={`task-priority-${id}`}
            name="priority"
            defaultValue={task?.priority ?? "medium"}
            className={inputClass}
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={`task-due-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            截止日期
          </label>
          <input
            id={`task-due-${id}`}
            name="dueDate"
            type="date"
            defaultValue={
              task?.dueDate ? toDateInputValue(task.dueDate) : undefined
            }
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton className="zouzou-primary-button inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
