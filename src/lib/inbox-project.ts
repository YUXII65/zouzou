import { prisma } from "@/lib/prisma";

type ProjectTransaction = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type EnsureInboxProjectInput = {
  userId: string;
  inboxItemId: string;
  content: string;
  projectId?: string | null;
  projectName?: string | null;
  projectObjective?: string | null;
  projectMilestone?: string | null;
  fallbackTaskTitle?: string | null;
  fallbackTaskShortTitle?: string | null;
  fallbackDoneWhen?: string | null;
};

function compact(value: string | null | undefined, length = 24) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > length ? text.slice(0, length).trim() : text;
}

export function deriveInboxProjectName(input: {
  content: string;
  taskTitle?: string | null;
  taskShortTitle?: string | null;
}) {
  const source =
    compact(input.taskShortTitle, 24) ||
    input.taskTitle?.split(/[，,。；;！？!?\n]/)[0] ||
    input.content;
  const cleaned = String(source ?? "")
    .replace(/^(?:今天|明天|这周|本周|先|请|帮我|需要|想要?|把)\s*/u, "")
    .replace(/[「」“”]/g, "")
    .trim();
  return compact(cleaned, 20) || "第一个项目";
}

export async function ensureInboxProject(
  tx: ProjectTransaction,
  input: EnsureInboxProjectInput,
) {
  if (input.projectId) return input.projectId;

  const linked = await tx.project.findFirst({
    where: {
      userId: input.userId,
      createdFromInboxItemId: input.inboxItemId,
    },
    select: { id: true },
  });
  if (linked) return linked.id;

  const requestedName = compact(input.projectName, 80);
  if (requestedName) {
    const sameName = await tx.project.findFirst({
      where: { userId: input.userId, name: requestedName },
      select: { id: true },
    });
    if (sameName) return sameName.id;
  }

  const projectName =
    requestedName ||
    deriveInboxProjectName({
      content: input.content,
      taskTitle: input.fallbackTaskTitle,
      taskShortTitle: input.fallbackTaskShortTitle,
    });
  const objective =
    compact(input.projectObjective, 500) ||
    compact(input.content, 500) ||
    "把这件事推进成可以持续处理的项目";
  const milestone =
    compact(input.projectMilestone, 200) ||
    compact(input.fallbackDoneWhen, 200) ||
    compact(input.fallbackTaskTitle, 200) ||
    "完成当前这批任务并确认下一步";

  const project = await tx.project.create({
    data: {
      userId: input.userId,
      name: projectName,
      objective,
      currentMilestone: milestone,
      createdFromInboxItemId: input.inboxItemId,
      notes: input.content,
    },
    select: { id: true },
  });

  return project.id;
}

/**
 * 修复旧版本遗留：AI 计划已经生成任务，但任务没有 projectId，项目也没建立。
 * 以共享 inboxItemId 为一组，为每组补齐项目并归入任务。
 */
export async function repairUnassignedInboxProjects(userId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      projectId: null,
      inboxItemId: { not: null },
    },
    select: {
      id: true,
      inboxItemId: true,
      title: true,
      shortTitle: true,
      doneWhen: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!tasks.length) return;

  const groups = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const inboxItemId = task.inboxItemId;
    if (!inboxItemId) continue;
    const group = groups.get(inboxItemId) ?? [];
    group.push(task);
    groups.set(inboxItemId, group);
  }

  for (const [inboxItemId, group] of groups) {
    const item = await prisma.inboxItem.findFirst({
      where: { id: inboxItemId, userId },
      select: { id: true, content: true },
    });
    if (!item) continue;

    const firstTask = group[0];
    await prisma.$transaction(async (tx) => {
      const projectId = await ensureInboxProject(tx, {
        userId,
        inboxItemId,
        content: item.content,
        fallbackTaskTitle: firstTask.title,
        fallbackTaskShortTitle: firstTask.shortTitle,
        fallbackDoneWhen: firstTask.doneWhen,
      });
      await tx.task.updateMany({
        where: {
          userId,
          projectId: null,
          id: { in: group.map((task) => task.id) },
        },
        data: { projectId },
      });
    });
  }
}
