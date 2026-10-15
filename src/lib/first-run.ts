import { prisma } from "@/lib/prisma";
import { FIRST_RUN_PREFERENCE } from "@/lib/preferences";

const FRESH_ACCOUNT_DAYS = 14;

export type FirstRunState = {
  /** 新手引导进度："1" | "2" | "3" | "done" */
  tourStep: string;
  /** 是否还在新手期：决定是否显示引导、图标文字标签、页内提示 */
  isFirstRun: boolean;
};

/**
 * 新手指引的开关放在服务端（UserPreference），不再依赖 localStorage。
 * 之前的实现只在 /welcome 挂载时写 localStorage，绕过那条路径的用户
 * （游客转正、换设备、直接进 /workspace）永远看不到任何引导。
 */
/**
 * 新手状态的判定。抽出来是为了让「一条 SQL 取回三个字段」的调用方
 * （getFirstRunState / loadHomeSupport）共用同一份规则，不走样。
 */
export function resolveFirstRunState(input: {
  createdAt?: Date | null;
  tourValue?: string | null;
  projectCount: number;
  taskCount: number;
}): FirstRunState {
  // 历史数据里可能存过已取消的第 4 步（复盘引导），统一视为已完成。
  const tourStep = input.tourValue === "4" ? "done" : (input.tourValue ?? "1");
  const tourDone = tourStep === "done";
  const freshAccount = input.createdAt
    ? input.createdAt.getTime() >
      Date.now() - FRESH_ACCOUNT_DAYS * 24 * 60 * 60 * 1000
    : false;
  // 只针对"第一个项目 + 少量任务"的空间，老用户和 demo 数据不会被弹
  const smallWorkspace = input.projectCount <= 1 && input.taskCount <= 3;
  const tourInProgress = ["2", "3"].includes(tourStep);

  return {
    tourStep,
    isFirstRun: !tourDone && freshAccount && (smallWorkspace || tourInProgress),
  };
}

/**
 * 原来这里发 3 条查询（偏好 + 项目数 + 任务数）。
 * 跨洋链路上查询一多就互相拖慢，合成一条 SQL 后只剩 1 次往返。
 */
const FIRST_RUN_SQL = `
SELECT
  (SELECT value FROM user_preferences
     WHERE "userId" = $1 AND key = $2 AND source = $3
     LIMIT 1) AS "tourValue",
  (SELECT count(*) FROM projects WHERE "userId" = $1) AS "projectCount",
  (SELECT count(*) FROM tasks WHERE "userId" = $1) AS "taskCount",
  (SELECT "createdAt" FROM users WHERE id = $1) AS "userCreatedAt"
`;

type FirstRunRow = {
  tourValue: string | null;
  projectCount: number | string;
  taskCount: number | string;
  userCreatedAt: Date | string | null;
};

export async function getFirstRunState(
  userId: string,
  createdAt?: Date | null,
): Promise<FirstRunState> {
  const rows = await prisma.$queryRawUnsafe<FirstRunRow[]>(
    FIRST_RUN_SQL,
    userId,
    FIRST_RUN_PREFERENCE.key,
    FIRST_RUN_PREFERENCE.source,
  );
  const row = rows[0];

  return resolveFirstRunState({
    // 调用方没传 createdAt 时用同一条 SQL 里取回的值，
    // 这样「查用户」可以并进这一批，不用为了 createdAt 先单独查一次 users。
    createdAt:
      createdAt ??
      (row?.userCreatedAt ? new Date(row.userCreatedAt) : null),
    tourValue: row?.tourValue ?? null,
    projectCount: Number(row?.projectCount ?? 0),
    taskCount: Number(row?.taskCount ?? 0),
  });
}

export async function setFirstRunTourStep(userId: string, step: string) {
  await prisma.userPreference.upsert({
    where: {
      userId_key_source: {
        userId,
        key: FIRST_RUN_PREFERENCE.key,
        source: FIRST_RUN_PREFERENCE.source,
      },
    },
    update: { value: step },
    create: {
      userId,
      key: FIRST_RUN_PREFERENCE.key,
      source: FIRST_RUN_PREFERENCE.source,
      value: step,
    },
  });
}

/**
 * 首组任务指第一次 AI 计划生成的一批任务（共享 inboxItemId）。
 * 只有组内至少完成一件，且没有仍待办/进行中的任务时，才允许进入复盘引导。
 */
export async function isFirstPlanGroupComplete(userId: string) {
  const firstPlanTask = await prisma.task.findFirst({
    where: { userId, inboxItemId: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { inboxItemId: true },
  });
  const inboxItemId = firstPlanTask?.inboxItemId;
  if (!inboxItemId) return false;

  const tasks = await prisma.task.findMany({
    where: { userId, inboxItemId },
    select: { status: true },
  });
  const hasDone = tasks.some((task) => task.status === "done");
  const hasOpen = tasks.some(
    (task) => task.status === "todo" || task.status === "in_progress",
  );

  return hasDone && !hasOpen;
}
