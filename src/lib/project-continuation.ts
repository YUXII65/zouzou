import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  advanceExploreAfterTask,
  prepareExploreContinuationForTask,
  prepareProjectContinuationAfterPlan,
} from "@/lib/project-progress-agent";
import { hasPreparedExploreContinuation } from "@/lib/project-progress-types";

/**
 * 探索任务结束后优先消费提前生成的下一条。
 * 有缓存时只做数据库落库，必须等它完成再返回；没有缓存才在响应后补模型。
 */
export async function scheduleExploreContinuationAfterTask(input: {
  userId: string;
  taskId: string;
}): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId: input.userId },
    select: {
      nextTaskJson: true,
      project: { select: { mode: true } },
    },
  });
  if (task?.project?.mode !== "explore") return false;
  const hasPrepared = hasPreparedExploreContinuation(task.nextTaskJson);

  if (hasPrepared) {
    const createdTaskId = await advanceExploreAfterTask({
      userId: input.userId,
      taskId: input.taskId,
      preparedOnly: true,
    });
    if (createdTaskId) {
      after(async () => {
        await prepareExploreContinuationForTask({
          userId: input.userId,
          taskId: createdTaskId,
        }).catch(() => {});
      });
    }
    return true;
  }

  after(async () => {
    const createdTaskId = await advanceExploreAfterTask({
      userId: input.userId,
      taskId: input.taskId,
    }).catch(() => null);
    if (!createdTaskId) return;
    await prepareExploreContinuationForTask({
      userId: input.userId,
      taskId: createdTaskId,
    }).catch(() => {});
  });
  return false;
}

/** 计划确认响应返回后，立刻为长期/探索项目预热下一步。 */
export function scheduleProjectContinuationPreparation(input: {
  userId: string;
  projectId: string | null;
}) {
  if (!input.projectId) return;
  const projectId = input.projectId;
  after(async () => {
    await prepareProjectContinuationAfterPlan({
      userId: input.userId,
      projectId,
    }).catch(() => {});
  });
}
