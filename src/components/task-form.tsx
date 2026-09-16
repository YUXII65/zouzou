import { AiTaskEditAssistant } from "@/components/ai-task-edit-assistant";
import { SubmitButton } from "@/components/submit-button";
import { toDateInputValue } from "@/lib/date";

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2 text-sm text-ink";

type TaskFormTask = {
  id: string;
  title: string;
  shortTitle: string | null;
  notes: string | null;
  projectId: string | null;
  status: string;
  priority: string;
  scheduledDate: Date | null;
  dueDate: Date | null;
  focusDate: Date | null;
};

export function TaskForm({
  action,
  projects,
  task,
  defaultProjectId,
  returnTo,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  projects: Array<{ id: string; name: string }>;
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
        name="notes"
        id={`task-notes-${id}`}
        defaultValue={task?.notes ?? ""}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor={`task-title-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            任务内容
          </label>
          <input
            id={`task-title-${id}`}
            name="title"
            required
            defaultValue={task?.title}
            placeholder="一个清晰、可执行的动作"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={`task-short-title-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            精简标题
          </label>
          <input
            id={`task-short-title-${id}`}
            name="shortTitle"
            defaultValue={task?.shortTitle ?? ""}
            placeholder="例如：验证国内替代方案"
            className={inputClass}
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
            htmlFor={`task-project-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            所属项目
          </label>
          <select
            id={`task-project-${id}`}
            name="projectId"
            defaultValue={task?.projectId ?? defaultProjectId ?? ""}
            className={inputClass}
          >
            <option value="">未关联项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
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
            htmlFor={`task-status-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            状态
          </label>
          <select
            id={`task-status-${id}`}
            name="status"
            defaultValue={task?.status ?? "todo"}
            className={inputClass}
          >
            <option value="todo">待办</option>
            <option value="in_progress">进行中</option>
            <option value="done">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={`task-scheduled-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            计划日期
          </label>
          <input
            id={`task-scheduled-${id}`}
            name="scheduledDate"
            type="date"
            defaultValue={
              task?.scheduledDate
                ? toDateInputValue(task.scheduledDate)
                : undefined
            }
            className={inputClass}
          />
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

        <div>
          <label
            htmlFor={`task-focus-${id}`}
            className="mb-1.5 block text-xs font-medium text-ink-secondary"
          >
            今日重点日期
          </label>
          <input
            id={`task-focus-${id}`}
            name="focusDate"
            type="date"
            defaultValue={
              task?.focusDate ? toDateInputValue(task.focusDate) : undefined
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
