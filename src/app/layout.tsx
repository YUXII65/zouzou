import type { Metadata } from "next";
import "./globals.css";
import { AppChrome } from "@/components/app-chrome";
import { SiteFooter } from "@/components/site-footer";
import { UsageTracker } from "@/components/usage-tracker";
import { isAdminUsername } from "@/lib/admin";
import { ASSET_GUARD_CSS, ASSET_GUARD_SCRIPT } from "@/lib/asset-guard";
import { getCurrentUser, isGuestUser } from "@/lib/auth";
import { GuestBanner } from "@/components/guest-banner";

export const metadata: Metadata = {
  title: {
    default: "走走",
    template: "%s | 走走",
  },
  description: "把零散想法变成可持续推进的个人项目",
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", type: "image/x-icon", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/icon.png", sizes: "256x256", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 只查一次用户：管理员入口、游客提示条、角落的账号资料都从这里来
  const user = await getCurrentUser();
  const isAdmin = user ? isAdminUsername(user.username) : false;
  const isGuest = user ? isGuestUser(user) : false;
  const completedTaskCount = user?._count.tasks ?? 0;
  const profileUser = user
    ? {
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isGuest,
      }
    : null;

  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-dvh text-ink">
        {/*
          静态资源守卫：EdgeOne 发布窗口内 /_next/static/* 可能 404，且这些 404 带
          immutable 缓存头，普通刷新救不回来。这段内联脚本会检测样式是否生效、
          用带缓存击穿参数的 URL 重试，并在失败期间启用一份极简兜底样式。
        */}
        <style dangerouslySetInnerHTML={{ __html: ASSET_GUARD_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: ASSET_GUARD_SCRIPT }} />
        <AppChrome isAdmin={isAdmin} user={profileUser} />
        <UsageTracker />
        <div className="lg:pl-[72px]">
          {isGuest ? <GuestBanner /> : null}
          <main className="mx-auto w-full max-w-5xl px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-12">
            {children}
          </main>
          <SiteFooter showFeedback={completedTaskCount >= 3} />
        </div>
      </body>
    </html>
  );
}
