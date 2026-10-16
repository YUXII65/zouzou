import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import {
  generateProjectEditSuggestion,
  generateTaskEditSuggestion,
  type ProjectEditSuggestion,
  type TaskEditSuggestion,
} from "@/lib/ai";

/**
 * AI 辅助编辑（任务 / 项目）的唯一实现：网页组件和小程序都调这里。
 *
 * 之前小程序侧漏传了 aiContext.decisionMemory，同一个入口在小程序里
 * 拿到的上下文比网页少一段，建议质量不稳定。
 */
export async function buildTaskEditSuggestion(
  input: {
    taskId?: string;
    title: string;
    shortTitle?: string | null;
    notes?: string | null;
    priority?: string;
    scheduledDate?: string | null;
    dueDate?: string | null;
    focusDate?: string | null;
    idea: string;
  },
  userId: string,
): Promise<TaskEditSuggestion> {
  const aiContext = await buildAiContext({
    kind: "task_edit",
    taskId: input.taskId,
    userId,
  });
  const { taskId: _taskId, ...suggestionInput } = input;
  void _taskId;
  return withAiQuota(
    "task_edit",
    () =>
      generateTaskEditSuggestion(
        suggestionInput,
        aiContext.summary,
        aiContext.evidence,
        aiContext.decisionMemory,
      ),
    userId,
  );
}

export async function buildProjectEditSuggestion(
  input: {
    projectId?: string;
    name: string;
    objective: string;
    currentMilestone?: string | null;
    status?: string;
    notes?: string | null;
    idea: string;
  },
  userId: string,
): Promise<ProjectEditSuggestion> {
  const aiContext = await buildAiContext({
    kind: "project_edit",
    projectId: input.projectId,
    userId,
  });
  const { projectId: _projectId, ...suggestionInput } = input;
  void _projectId;
  return withAiQuota(
    "project_edit",
    () =>
      generateProjectEditSuggestion(
        suggestionInput,
        aiContext.summary,
        aiContext.evidence,
        aiContext.decisionMemory,
      ),
    userId,
  );
}