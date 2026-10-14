import { LogoutButton } from "@/components/logout-button";
import { ProfileNameCard } from "@/components/profile-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiSettings } from "@/components/ai-settings";
import { prisma } from "@/lib/prisma";
import { isGuestUser, requireUser } from "@/lib/auth";
import { normalizeProjectMode, type ProjectMode } from "@/lib/work-mode";
import { isOpenTaskStatus } from "@/lib/task-flow";

export const metadata = {
  title: "个人",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    select: {
      mode: true,
      tasks: { select: { status: true } },
    },
  });

  const serverConnected = Boolean(
    process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
  );

  const counts: Record<ProjectMode, number> = {
    normal: 0,
    longterm: 0,
    explore: 0,
  };
  for (const project of projects) {
    const mode = normalizeProjectMode(project.mode);
    if (project.tasks.some((task) => isOpenTaskStatus(task.status))) {
      counts[mode] += 1;
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-2xl">
        {/* 名片：只有头像、昵称和三个模式的推进数量 */}
        <ProfileNameCard
          user={{
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isGuest: isGuestUser(user),
          }}
          counts={counts}
        />

        {/* 功能区：三个动作并列 */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <ThemeToggle variant="row" className="w-full justify-center" />
          <AiSettings serverConnected={serverConnected} />
          <LogoutButton
            showLabel
            className="inline-flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/70 px-2 text-xs font-medium text-ink-secondary transition-colors hover:border-danger/30 hover:bg-danger/10 hover:text-danger sm:gap-2 sm:px-4 sm:text-sm"
          />
        </div>

        {/* 下方留白 */}
        <div className="min-h-[30vh]" aria-hidden />
      </div>
    </>
  );
}
