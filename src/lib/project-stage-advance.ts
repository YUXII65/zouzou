import { withTransactionRetry } from "@/lib/prisma";
import { priority, taskContractData } from "@/lib/task-contract-fields";
function dateString(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}
import {
  MAX_LONGTERM_STAGES,
  parseStagePreview,
} from "@/lib/project-progress-types";
import {
  decisionCardFromTask,
  stickyPayloadFromDecisionCard,
} from "@/lib/decision";

/**
 * 长期项目「进入下一阶段」的唯一实现：网页文件页和小程序文件页都调它。
 *
 * 之前这段逻辑只写在网页的 server action 里，小程序没有对应接口，
 * 所以小程序的文件页只能看阶段、不能推进。抽到这里后两端共用。
 */
export type AdvanceProjectStageResult = {
  advanced: boolean;
  /** 新阶段还缺「下一阶段」预览时，调用方负责在响应之后补生成 */
  nextStageId: string | null;
};

export async function advanceProjectStage(input: {
  userId: string;
  stageId: string;
}): Promise<AdvanceProjectStageResult> {
  let createdNextStageId: string | null = null;
  let advanced = false;

  await withTransactionRetry(async (tx) => {
    const stage = await tx.projectStage.findFirst({
      where: { id: input.stageId, userId: input.userId },
      include: {
        project: { select: { id: true, userId: true } },
      },
    });
    if (!stage || stage.status !== "ready") return;

    const preview = parseStagePreview(stage.nextStageJson);
    if (!preview?.tasks.length) return;

    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${stage.projectId} FOR UPDATE`;

    // 原子抢占：同一个 ready 阶段只能有一个请求把它推进到下一阶段。
    const claimed = await tx.projectStage.updateMany({
      where: { id: stage.id, userId: input.userId, status: "ready" },
      data: { status: "completed", completedAt: new Date() },
    });
    if (claimed.count === 0) return;

    // 防止历史重复请求或脏数据已经创建过下一阶段。
    const existingNextStage = await tx.projectStage.findFirst({
      where: {
        projectId: stage.projectId,
        userId: input.userId,
        order: { gt: stage.order },
      },
      select: { id: true },
    });
    if (existingNextStage) return;

    const plannedTasks = preview.tasks.slice(0, 4);
    if (!plannedTasks.length || stage.order >= MAX_LONGTERM_STAGES) {
      await tx.project.update({
        where: { id: stage.projectId, userId: input.userId },
        data: { status: "paused" },
      });
      return;
    }

    const shouldCreateNextStage =
      plannedTasks.length >= 2 ||
      plannedTasks.some((task) =>
        /等|等待|审批|签字|回复|反馈|到账|排期|对方|外部/.test(task.title),
      );

    let targetStageId = stage.id;
    if (shouldCreateNextStage) {
      const nextStage = await tx.projectStage.create({
        data: {
          userId: input.userId,
          projectId: stage.projectId,
          order: stage.order + 1,
          title: "当前阶段",
          deliverable: preview.nextMilestone,
          status: "active",
        },
        select: { id: true },
      });
      targetStageId = nextStage.id;
      // 只有后面还有阶段才需要为它预生成「下一阶段」；到上限就别再打一次 AI。
      if (stage.order + 1 < MAX_LONGTERM_STAGES) {
        createdNextStageId = nextStage.id;
      }
    } else {
      // 只有一条真实动作时，不单独造一个阶段，并回当前阶段继续推进。
      await tx.projectStage.update({
        where: { id: stage.id, userId: input.userId },
        data: {
          status: "active",
          completedAt: null,
          nextStageJson: null,
          nextStageUpdatedAt: null,
        },
      });
    }

    for (const [index, plannedTask] of plannedTasks.entries()) {
      const created = await tx.task.create({
        data: {
          userId: input.userId,
          title: plannedTask.title,
          shortTitle: plannedTask.shortTitle,
          notes: plannedTask.notes,
          projectId: stage.projectId,
          stageId: targetStageId,
          status: "todo",
          priority: priority(plannedTask.priority),
          scheduledDate: dateString(plannedTask.scheduledDate),
          dueDate: dateString(plannedTask.dueDate),
          planOrder: index,
          ...taskContractData({
            title: plannedTask.title,
            notes: plannedTask.notes,
            executionMode: plannedTask.executionMode,
            doneWhen: plannedTask.doneWhen,
            methodHint: plannedTask.methodHint,
            maxTurns: plannedTask.maxTurns,
            toolPolicy: plannedTask.toolPolicy,
          }),
        },
        select: { id: true },
      });

      const sticky = stickyPayloadFromDecisionCard(
        decisionCardFromTask(plannedTask),
      );
      await tx.taskStickyNote.create({
        data: {
          userId: input.userId,
          taskId: created.id,
          sourceMessage: "长期阶段衔接 Agent",
          title: sticky.title,
          encouragement: sticky.encouragement,
          stepsJson: JSON.stringify(sticky.steps),
          nextStep: sticky.nextStep,
        },
      });
    }

    await tx.project.update({
      where: { id: stage.projectId, userId: input.userId },
      data: { currentMilestone: preview.nextMilestone, status: "active" },
    });

    advanced = true;
  });

  return { advanced, nextStageId: createdNextStageId };
}