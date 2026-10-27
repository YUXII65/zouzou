import { prisma } from "@/lib/prisma";
import { isGuestUser } from "@/lib/guest-user";
import { normalizeProjectMode, type ProjectMode } from "@/lib/work-mode";
import { isOpenTaskStatus } from "@/lib/task-flow";
import {
  CHECKIN_MODE,
  checkinDateKey,
  checkinDayNumber,
  type CheckinProjectSummary,
} from "@/lib/checkin";

/**
 * 个人页的共享视图契约：网页 /profile 和小程序个人页消费同一份。
 *
 * 旧结构：网页自己查项目算「三模式推进中」，小程序 /api/miniprogram/me
 * 只回 user，而页面却在读 result.counts——所以小程序的名片计数一直是 0。
 */
export type ProfileViewCounts = Record<ProjectMode, number>;

export type ProfileView = {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    isGuest: boolean;
  };
  counts: ProfileViewCounts;
  checkin: CheckinProjectSummary | null;
  serverConnected: boolean;
};

export async function buildProfileView(input: {
  userId: string;
}): Promise<ProfileView | null> {
  const today = checkinDateKey();
  const [user, projects] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId } }),
    prisma.project.findMany({
      where: { userId: input.userId },
      select: {
        id: true,
        name: true,
        mode: true,
        status: true,
        createdAt: true,
        tasks: {
          orderBy: { planOrder: "asc" },
          select: {
            id: true,
            title: true,
            status: true,
            checkinCompletions: {
              where: { checkinDate: today },
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);
  if (!user) return null;

  const counts: ProfileViewCounts = {
    checkin: 0,
    normal: 0,
    longterm: 0,
    explore: 0,
  };
  let checkin: CheckinProjectSummary | null = null;
  for (const project of projects) {
    const mode = normalizeProjectMode(project.mode);
    if (mode === CHECKIN_MODE) {
      if (project.status === "active" && project.tasks.length > 0) {
        counts.checkin = 1;
        checkin = {
          projectId: project.id,
          projectName: project.name,
          completedToday: project.tasks.filter(
            (task) => task.checkinCompletions.length > 0,
          ).length,
          totalItems: project.tasks.length,
          dayNumber: checkinDayNumber(project.createdAt),
          items: project.tasks.map((task) => ({
            id: task.id,
            title: task.title,
          })),
        };
      }
      continue;
    }
    if (project.tasks.some((task) => isOpenTaskStatus(task.status))) {
      counts[mode] += 1;
    }
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isGuest: isGuestUser(user),
    },
    counts,
    checkin,
    serverConnected: Boolean(
      process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    ),
  };
}
