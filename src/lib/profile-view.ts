import { prisma } from "@/lib/prisma";
import { isGuestUser } from "@/lib/guest-user";
import { normalizeProjectMode, type ProjectMode } from "@/lib/work-mode";
import { isOpenTaskStatus } from "@/lib/task-flow";

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
  serverConnected: boolean;
};

export async function buildProfileView(input: {
  userId: string;
}): Promise<ProfileView | null> {
  const [user, projects] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId } }),
    prisma.project.findMany({
      where: { userId: input.userId },
      select: {
        mode: true,
        tasks: { select: { status: true } },
      },
    }),
  ]);
  if (!user) return null;

  const counts: ProfileViewCounts = { normal: 0, longterm: 0, explore: 0 };
  for (const project of projects) {
    const mode = normalizeProjectMode(project.mode);
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
    serverConnected: Boolean(
      process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    ),
  };
}