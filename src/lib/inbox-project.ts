import type { InboxPlanTrack } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { normalizeProjectMode } from "@/lib/work-mode";

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
  /**
   * 只有 AI（或用户）明确判断"这就是已有项目在做的那件事"时才为 true。
   * 默认 false：宁可新建一个项目，也不要把不相关的想法并进别人的项目。
   */
  reuseExistingProject?: boolean;
  /** 这个想法最终归到哪种推进模式（v3.3 文件页分类） */
  mode?: string | null;
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
  // 按名字复用必须由调用方显式要求。之前这里无条件按名字匹配，导致两条不相关
  // 的想法只要生成的项目名撞上，就悄悄并进同一个项目（用户实测：年度计划 + 打游戏）。
  if (requestedName && input.reuseExistingProject) {
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
      mode: normalizeProjectMode(input.mode),
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

/**
 * 幂等写入探索线路，返回「线路名 → trackId」。
 *
 * 复用已有项目时同名线路直接沿用，不会因为再次确认计划重复建线。
 */
export async function ensureProjectTracks(
  tx: ProjectTransaction,
  input: { userId: string; projectId: string; tracks: InboxPlanTrack[] },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!input.tracks.length) return map;

  const existing = await tx.projectTrack.findMany({
    where: { userId: input.userId, projectId: input.projectId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  for (const track of existing) map.set(track.name, track.id);

  let nextOrder = existing.length;
  for (const track of input.tracks) {
    if (map.has(track.name)) continue;
    const created = await tx.projectTrack.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        order: nextOrder,
        name: track.name,
        intent: track.intent,
        role: track.role,
        status: "active",
      },
      select: { id: true },
    });
    nextOrder += 1;
    map.set(track.name, created.id);
  }
  return map;
}

