import type { PrismaTransactionClient } from "@/lib/prisma";

export type StageGateTask = {
  status: string;
};

export type StageGateState = "active" | "ready";

export type StageGate = {
  state: StageGateState;
  total: number;
  done: number;
  open: number;
  cancelled: number;
};

export const PROJECT_STAGE_STATUS_LABELS: Record<
  "active" | "ready" | "completed" | "cancelled",
  string
> = {
  active: "推进中",
  ready: "待确认",
  completed: "已完成",
  cancelled: "已取消",
};

/**
 * 阶段门只看当前阶段的任务集合。
 *
 * - 没有任务：不能算完成，避免空阶段被误判为 ready
 * - 有 todo / in_progress：继续 active
 * - 有 cancelled：任务并没有以 done 的方式交付，继续 active
 * - 全部 done：进入 ready，等待交付物确认 / 下一阶段预览
 */
export function evaluateStageGate(tasks: StageGateTask[]): StageGate {
  const done = tasks.filter((task) => task.status === "done").length;
  const cancelled = tasks.filter((task) => task.status === "cancelled").length;
  const open = tasks.length - done - cancelled;
  const state: StageGateState =
    tasks.length > 0 && open === 0 && cancelled === 0 ? "ready" : "active";

  return { state, total: tasks.length, done, open, cancelled };
}

export async function currentProjectStageId(
  tx: PrismaTransactionClient,
  input: { userId: string; projectId: string },
) {
  const stage = await tx.projectStage.findFirst({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      status: { in: ["active", "ready"] },
    },
    orderBy: [{ order: "desc" }, { id: "asc" }],
    select: { id: true },
  });
  return stage?.id ?? null;
}

type EnsureStageInput = {
  userId: string;
  projectId: string;
  mode: string;
  milestone?: string | null;
  objective?: string | null;
};

/**
 * 长期项目始终保留一个当前阶段。
 * 旧项目第一次进入长期模式时，把当前还没有阶段归属的任务归入这个阶段。
 */
export async function ensureCurrentProjectStage(
  tx: PrismaTransactionClient,
  input: EnsureStageInput,
) {
  if (input.mode !== "longterm") return null;

  const existing = await tx.projectStage.findFirst({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      status: { in: ["active", "ready"] },
    },
    orderBy: [{ order: "desc" }, { id: "asc" }],
    select: { id: true },
  });
  if (existing) return existing.id;

  const stageCount = await tx.projectStage.count({
    where: { userId: input.userId, projectId: input.projectId },
  });
  const stage = await tx.projectStage.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      order: stageCount + 1,
      title: "当前阶段",
      deliverable:
        input.milestone?.trim() ||
        input.objective?.trim() ||
        "完成当前阶段的可交付结果",
    },
    select: { id: true },
  });

  await tx.task.updateMany({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      stageId: null,
    },
    data: { stageId: stage.id },
  });

  return stage.id;
}

/**
 * 任务状态变更后重新计算当前阶段门。
 * completed / cancelled 是终态，不在这里回退；其余阶段只允许在 active / ready 之间切换。
 */
export async function syncProjectStageGate(
  tx: PrismaTransactionClient,
  input: { userId: string; projectId: string },
) {
  const stage = await tx.projectStage.findFirst({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      status: { in: ["active", "ready"] },
    },
    orderBy: [{ order: "desc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      tasks: { select: { status: true } },
    },
  });
  if (!stage) return null;

  const gate = evaluateStageGate(stage.tasks);
  if (stage.status === gate.state) return gate;

  await tx.projectStage.update({
    where: { id: stage.id, userId: input.userId },
    data: {
      status: gate.state,
      completedAt: null,
      // active 阶段可以提前看到一份"下一阶段预览"；阶段真正收尾时要重算，
      // 否则 ready 时展示的还是几周前基于旧进度做的推断。
      ...(gate.state === "ready" && stage.status === "active"
        ? { nextStageJson: null, nextStageUpdatedAt: null }
        : {}),
    },
  });

  return gate;
}
