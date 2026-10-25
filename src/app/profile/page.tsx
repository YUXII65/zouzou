import { LogoutButton } from "@/components/logout-button";
import { ProfileNameCard } from "@/components/profile-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiSettings } from "@/components/ai-settings";
import { CheckinModeButton } from "@/components/checkin-controls";
import { readSessionUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { buildProfileView } from "@/lib/profile-view";

export const metadata = {
  title: "个人",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // 先解 cookie 拿 userId（不查库），把「查用户」和项目统计并到同一轮往返。
  const userId = await readSessionUserId();
  if (!userId) redirect("/login");
  // 个人页数据走两端共用的视图契约，小程序个人页消费同一份。
  const view = await buildProfileView({ userId });
  if (!view) redirect("/login");
  const { user, counts, checkin, serverConnected } = view;

  return (
    <>
      <div className="mx-auto w-full max-w-3xl">
        {/* 名片：只有头像、昵称和三种 AI 模式的推进数量 */}
        <ProfileNameCard
          user={{
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isGuest: user.isGuest,
          }}
          counts={counts}
        />

        {/* 功能区：竖屏 2×2，横屏一排四个 */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <CheckinModeButton checkin={checkin} />
          <ThemeToggle variant="row" className="w-full" />
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
