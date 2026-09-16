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
export async function getFirstRunState(
  userId: string,
  createdAt?: Date | null,
): Promise<FirstRunState> {
  const [preference, projectCount, taskCount] = await Promise.all([
    prisma.userPreference.findUnique({
      where: {
        userId_key_source: {
          userId,
          key: FIRST_RUN_PREFERENCE.key,
          source: FIRST_RUN_PREFERENCE.source,
        },
      },
      select: { value: true },
    }),
    prisma.project.count({ where: { userId } }),
    prisma.task.count({ where: { userId } }),
  ]);

  const tourStep = preference?.value ?? "1";
  const tourDone = tourStep === "done";
  const freshAccount = createdAt
    ? createdAt.getTime() > Date.now() - FRESH_ACCOUNT_DAYS * 24 * 60 * 60 * 1000
    : false;
  // 只针对"第一个项目 + 少量任务"的空间，老用户和 demo 数据不会被弹
  const smallWorkspace = projectCount <= 1 && taskCount <= 3;
  const tourInProgress = ["2", "3", "4"].includes(tourStep);

  return {
    tourStep,
    isFirstRun: !tourDone && freshAccount && (smallWorkspace || tourInProgress),
  };
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
