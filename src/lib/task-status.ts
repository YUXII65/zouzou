import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentProjectStageId, syncProjectStageGate } from "@/lib/project-stage";
import { generateLongtermStagePreview } from "@/lib/project-progress-agent";
import { scheduleExploreContinuationAfterTask } from "@/lib/project-continuation";
import { recordAiFeedback } from "@/lib/feedback";
import { recordUsageEvent } from "@/lib/usage";
import { invalidateAiContext } from "@/lib/ai-context";
import { toDateInputValue } from "@/lib/date";

/**
 * 任务状态变更的唯一实现：网页 server action 和小程序任务接口都调它。
 *
 * 之前网页那份还带「长期项目阶段预览调度 + 完成/取消反馈统计」，
 * 小程序那份没有，等于小程序里完成任务时部分联动是缺失的。
 */
export const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;
export type TaskStatusValue = (typeof TASK_STATUSES)[number];

function taskSnapshot(task: {
  title: string;
  status: string;
  priority?: string | null;
  scheduledDate?: Date | null;
  dueDate?: Date | null;
  projectId?: string | null;
}) {
  return JSON.stringify({
    title: task.title,
    status: task.status,
    priority: task.priority ?? null,
    scheduledDate: task.scheduledDate
      ? toDateInputValue(task.scheduledDate)
      : null,
    dueDate: task.dueDate ? toDateInputValue(task.dueDate) : null,
    projectId: task.projectId ?? null,
  });
}

function scheduleLongtermStagePreview(input: {
  userId: string;
  projectId: string | null;
  gate: { state: string; total: number } | null;
}) {
  // active：当前阶段进行中就预生成下一阶段，用户完成当前阶段时不必再等模型。
  // ready：正常情况下直接复用提前生成的预览；只有缺失时才在后台补生成。
  if (
    !input.projectId ||
    !input.gate ||
    input.gate.total === 0 ||
    (input.gate.state !== "active" && input.gate.state !== "ready")
  ) {
    return;
  }
  const projectId = input.projectId;
  after(async () => {
    try {
      const stageId = await currentProjectStageId(prisma, {
        userId: input.userId,
        projectId,
      });
      if (!stageId) return;
      const stage = await prisma.projectStage.findFirst({
        where: { id: stageId, userId: input.userId },
        select: { nextStageJson: true },
      });
      if (!stage || stage.nextStageJson) return;
      await generateLongtermStagePreview({
        userId: input.userId,
        stageId,
      });
    } catch {
      // 预览生成失败不阻塞任务完成，用户进入项目时仍可手动生成。
    }
  });
}

export async function applyTaskStatus(input: {
  userId: string;
  taskId: string;
  status: TaskStatusValue;
}): Promise<{ changed: boolean; status: TaskStatusValue }> {
  // 「完成」是终态；服务端也拦住，不能只依赖按钮 disabled。
  const updated = await prisma.task.updateManyAndReturn({
    where: {
      id: input.taskId,
      userId: input.userId,
      status: { not: "done" as const },
    },
    data: {
      status: input.status,
      completedAt: input.status === "done" ? new Date() : null,
      completedBy: input.status === "done" ? "user" : null,
    },
    select: {
      title: true,
      status: true,
      priority: true,
      scheduledDate: true,
      dueDate: true,
      projectId: true,
    },
  });
  if (!updated.length) {
    return { changed: false, status: "done" };
  }

  const updatedTask = updated[0];
  if (updatedTask.projectId) {
    const stageGate = await syncProjectStageGate(prisma, {
      userId: input.userId,
      projectId: updatedTask.projectId,
    });
    scheduleLongtermStagePreview({
      userId: input.userId,
      projectId: updatedTask.projectId,
      gate: stageGate,
    });
  }

  const status = input.status;
  if ((status === "done" || status === "cancelled") && updatedTask.projectId) {
    // 探索项目若有预生成下一条，会在这里同步落库；没有缓存才转后台补模型。
    await scheduleExploreContinuationAfterTask({
      userId: input.userId,
      taskId: input.taskId,
    });
  }
  const reviewNextStatus =
    status === "done"
      ? "done"
      : status === "cancelled"
        ? "cancelled"
        : "pending";

  // 状态按钮必须尽快返回。统计、反馈学习和复盘联动放到响应完成后执行，
  // 避免 Neon 的网络往返阻塞用户操作。
  after(async () => {
    const backgroundTasks: Promise<unknown>[] = [
      prisma.reviewNextAction.updateMany({
        where: { taskId: input.taskId, userId: input.userId },
        data: { status: reviewNextStatus },
      }),
    ];

    if (status === "done") {
      backgroundTasks.push(
        recordAiFeedback({
          userId: input.userId,
          source: "task",
          action: "task_completed",
          taskId: input.taskId,
          projectId: updatedTask.projectId,
          afterJson: taskSnapshot(updatedTask),
        }),
        recordUsageEvent({
          userId: input.userId,
          event: "task_completed",
          detail: input.taskId,
        }),
      );
    } else if (status === "cancelled") {
      backgroundTasks.push(
        recordAiFeedback({
          userId: input.userId,
          source: "task",
          action: "task_cancelled",
          taskId: input.taskId,
          projectId: updatedTask.projectId,
          afterJson: taskSnapshot(updatedTask),
        }),
      );
    }

    await Promise.all(backgroundTasks).catch(() => {});
  });

  invalidateAiContext(input.userId);
  return { changed: true, status };
}