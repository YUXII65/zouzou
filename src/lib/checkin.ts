import { prisma, withTransactionRetry } from "@/lib/prisma";
import { taskContractData } from "@/lib/task-contract-fields";

export const CHECKIN_MODE = "checkin" as const;
export const CHECKIN_PROJECT_NAME = "每日打卡";
export const CHECKIN_TIME_ZONE = "Asia/Shanghai";
export const MAX_CHECKIN_ITEMS_PER_WRITE = 30;
export const MAX_CHECKIN_ITEM_LENGTH = 80;

export type CheckinItemView = {
  id: string;
  title: string;
  completed: boolean;
  completedAt: Date | null;
};

export type CheckinTodayView = {
  projectId: string;
  projectName: string;
  date: string;
  completed: number;
  total: number;
  items: CheckinItemView[];
};

export type CheckinProjectSummary = {
  projectId: string;
  projectName: string;
  completedToday: number;
  totalItems: number;
  dayNumber: number;
};

type CheckinResult =
  | { ok: true; projectId: string; added: number }
  | { ok: false; error: string };

/**
 * 打卡按上海时区切日。日期直接存 YYYY-MM-DD，避免服务器部署在 UTC 时
 * 把中国用户晚上 8 点后的打卡算到第二天，也不需要定时任务清状态。
 */
export function checkinDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHECKIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** 创建当天算第 1 天；按上海日期切日，避免服务器 UTC 时区造成跨日偏差。 */
export function checkinDayNumber(createdAt: Date, now = new Date()) {
  const dateNumber = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  };
  return Math.max(
    1,
    dateNumber(checkinDateKey(now)) - dateNumber(checkinDateKey(createdAt)) + 1,
  );
}

/** 用户每行填一个待办；去掉空行、首尾空白和重复项。 */
export function parseCheckinItems(value: unknown) {
  const raw =
    Array.isArray(value)
      ? value.map(String).join("\n")
      : typeof value === "string"
        ? value
        : "";
  const seen = new Set<string>();
  const items: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const title = line.replace(/\s+/g, " ").trim().slice(0, MAX_CHECKIN_ITEM_LENGTH);
    if (!title) continue;
    const key = title.normalize("NFKC").toLocaleLowerCase("zh-CN");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(title);
    if (items.length >= MAX_CHECKIN_ITEMS_PER_WRITE) break;
  }

  return items;
}

function checkinTaskData(title: string, planOrder: number) {
  return {
    title,
    shortTitle: title.slice(0, 40),
    priority: "medium" as const,
    planOrder,
    ...taskContractData({
      title,
      executionMode: "quick",
      doneWhen: "今天完成这一项",
      methodHint: "按平时固定的做法完成这一项。",
    }),
  };
}

function prismaErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code ?? "");
}

function checkinSaveErrorMessage(error: unknown) {
  const code = prismaErrorCode(error);
  if (["P2021", "P2022"].includes(code)) {
    return "打卡数据还没准备好，请稍后刷新再试。";
  }
  if (["P1001", "P1017", "P2024", "P2028", "P2034"].includes(code)) {
    return "数据库连接不稳定，请稍后再试。";
  }
  return "没保存上，请稍后再试。";
}

export async function findCheckinProject(userId: string) {
  return prisma.project.findFirst({
    where: { userId, mode: CHECKIN_MODE },
    select: { id: true, name: true },
  });
}

/**
 * 一个账号只开一个打卡文件夹。checkinOwnerId 的数据库唯一约束负责兜底并发创建，
 * 重开被删除的打卡时该字段会随项目删除一起释放。
 */
export async function createCheckinProject(input: {
  userId: string;
  items: unknown;
}): Promise<CheckinResult> {
  const items = parseCheckinItems(input.items);
  if (!items.length) {
    return { ok: false, error: "先填写至少一个每日待办。" };
  }

  const existing = await findCheckinProject(input.userId);
  if (existing) {
    return { ok: true, projectId: existing.id, added: 0 };
  }

  try {
    // 项目和任务用一次嵌套写入提交。Prisma 会保证整段原子性，
    // 同时避免线上连接池抖动时跨多次事务查询更容易失效。
    const project = await prisma.project.create({
      data: {
        userId: input.userId,
        name: CHECKIN_PROJECT_NAME,
        objective: "每天完成这份打卡清单",
        mode: CHECKIN_MODE,
        checkinOwnerId: input.userId,
        tasks: {
          create: items.map((title, index) => ({
            userId: input.userId,
            ...checkinTaskData(title, index),
          })),
        },
      },
      select: { id: true },
    });
    return { ok: true, projectId: project.id, added: items.length };
  } catch (error) {
    // 双端同时点开启时，第二个请求直接回到已经创建好的同一个打卡文件夹。
    const raced = await findCheckinProject(input.userId).catch(() => null);
    if (raced) return { ok: true, projectId: raced.id, added: 0 };
    console.error("[checkin:create]", error);
    return { ok: false, error: checkinSaveErrorMessage(error) };
  }
}

/** 打卡开启后仍可继续补充条目，重复标题会被跳过。 */
export async function addCheckinItems(input: {
  userId: string;
  projectId?: string | null;
  items: unknown;
}): Promise<CheckinResult> {
  const parsed = parseCheckinItems(input.items);
  if (!parsed.length) {
    return { ok: false, error: "先填写至少一个每日待办。" };
  }

  return withTransactionRetry(async (tx) => {
    const project = await tx.project.findFirst({
      where: {
        userId: input.userId,
        mode: CHECKIN_MODE,
        ...(input.projectId ? { id: input.projectId } : {}),
      },
      select: {
        id: true,
        tasks: {
          select: { title: true, planOrder: true },
          orderBy: [{ planOrder: "desc" }, { createdAt: "desc" }],
        },
      },
    });
    if (!project) return { ok: false, error: "打卡文件夹不存在。" };

    const existingKeys = new Set(
      project.tasks.map((task) =>
        task.title.normalize("NFKC").toLocaleLowerCase("zh-CN"),
      ),
    );
    const additions = parsed.filter(
      (title) =>
        !existingKeys.has(title.normalize("NFKC").toLocaleLowerCase("zh-CN")),
    );
    if (!additions.length) {
      return { ok: true, projectId: project.id, added: 0 };
    }

    const nextOrder =
      Math.max(
        -1,
        ...project.tasks.map((task) => task.planOrder ?? -1),
      ) + 1;
    await tx.task.createMany({
      data: additions.map((title, index) =>
        ({
          userId: input.userId,
          projectId: project.id,
          ...checkinTaskData(title, nextOrder + index),
        }),
      ),
    });
    await tx.project.update({
      where: { id: project.id, userId: input.userId },
      data: { updatedAt: new Date() },
    });

    return { ok: true, projectId: project.id, added: additions.length };
  });
}

/** 同一项当天点一下标记完成，再点一下撤销；历史日期不会被改回今天。 */
export async function toggleCheckinItem(input: {
  userId: string;
  taskId: string;
  now?: Date;
}) {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId: input.userId },
    select: {
      id: true,
      projectId: true,
      project: { select: { id: true, mode: true } },
    },
  });
  if (!task?.projectId || task.project?.mode !== CHECKIN_MODE) {
    return { ok: false as const, error: "打卡条目不存在。" };
  }

  const checkinDate = checkinDateKey(input.now);
  const existing = await prisma.taskCheckinCompletion.findUnique({
    where: {
      taskId_checkinDate: { taskId: task.id, checkinDate },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.taskCheckinCompletion.delete({
      where: { id: existing.id },
    });
  } else {
    await prisma.taskCheckinCompletion.create({
      data: {
        userId: input.userId,
        taskId: task.id,
        checkinDate,
      },
    });
  }
  await prisma.project.update({
    where: { id: task.projectId, userId: input.userId },
    data: { updatedAt: new Date() },
  });

  return {
    ok: true as const,
    completed: !existing,
    checkinDate,
  };
}

/** 删除只允许作用于打卡项目；普通 AI 项目仍然沿用原来的不可删除规则。 */
export async function deleteCheckinProject(input: {
  userId: string;
  projectId: string;
}) {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      userId: input.userId,
      mode: CHECKIN_MODE,
    },
    select: { id: true },
  });
  if (!project) return { ok: false as const, error: "打卡文件夹不存在。" };

  await prisma.project.delete({ where: { id: project.id } });
  return { ok: true as const };
}
