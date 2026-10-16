import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  FolderKanban,
  NotebookPen,
  Sparkles,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "使用情况",
};

export const dynamic = "force-dynamic";

const ACTIVE_EVENTS = [
  "page_view",
  "login",
  "register",
  "onboarding_complete",
  "onboarding_skipped",
  "task_created",
  "task_completed",
  "review_saved",
];

function startOfDay(daysAgo = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function activeUserCount(since: Date) {
  const rows = await prisma.usageEvent.findMany({
    where: {
      createdAt: { gte: since },
      event: { in: ACTIVE_EVENTS },
    },
    distinct: ["userId"],
    select: { userId: true },
  });
  return rows.length;
}

async function eventUserCount(event: string) {
  const rows = await prisma.usageEvent.findMany({
    where: { event },
    distinct: ["userId"],
    select: { userId: true },
  });
  return rows.length;
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  const admin = await getAdminUser();
  if (!admin) {
    return <NotAuthorized />;
  }

  const now = new Date();
  const todayStart = startOfDay();
  const weekStart = startOfDay(6);
  const monthStart = startOfDay(29);

  const [
    totalUsers,
    activeToday,
    activeWeek,
    activeMonth,
    onboardingUsers,
    createdTaskUsers,
    completedTaskUsers,
    reviewedUsers,
    aiToday,
    aiMonth,
    recentUsers,
    recentEvents,
  ] = await Promise.all([
    prisma.user.count(),
    activeUserCount(todayStart),
    activeUserCount(weekStart),
    activeUserCount(monthStart),
    eventUserCount("onboarding_complete"),
    eventUserCount("task_created"),
    eventUserCount("task_completed"),
    eventUserCount("review_saved"),
    prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: todayStart } },
      _count: { _all: true },
      _sum: {
        totalTokens: true,
        promptCacheHitTokens: true,
        promptCacheMissTokens: true,
      },
    }),
    prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: {
        totalTokens: true,
        promptCacheHitTokens: true,
        promptCacheMissTokens: true,
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        username: true,
        createdAt: true,
        _count: { select: { tasks: true, reviews: true } },
      },
    }),
    prisma.usageEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { username: true } } },
    }),
  ]);

  const todayHitTokens = aiToday._sum.promptCacheHitTokens ?? 0;
  const todayMissTokens = aiToday._sum.promptCacheMissTokens ?? 0;
  const todayCacheRate =
    todayHitTokens + todayMissTokens > 0
      ? Math.round(
          (todayHitTokens / (todayHitTokens + todayMissTokens)) * 100,
        )
      : null;

  const [dauEvents, pageViewEvents] = await Promise.all([
    prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: startOfDay(13) },
        event: { in: ACTIVE_EVENTS },
      },
      select: { userId: true, createdAt: true },
    }),
    prisma.usageEvent.findMany({
      where: { event: "page_view", page: { not: null } },
      select: { page: true },
      take: 5000,
    }),
  ]);

  const activeByDay = new Map<string, Set<string>>();
  for (const event of dauEvents) {
    const key = localDayKey(new Date(event.createdAt));
    const set = activeByDay.get(key) ?? new Set<string>();
    set.add(event.userId);
    activeByDay.set(key, set);
  }

  const dailyActive = Array.from({ length: 14 }, (_, index) => {
    const date = startOfDay(13 - index);
    const key = localDayKey(date);
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: activeByDay.get(key)?.size ?? 0,
    };
  });
  const maxDaily = Math.max(...dailyActive.map((item) => item.count), 1);

  const pageViews = new Map<string, number>();
  for (const event of pageViewEvents) {
    if (!event.page) continue;
    pageViews.set(event.page, (pageViews.get(event.page) ?? 0) + 1);
  }
  const topPages = Array.from(pageViews.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const funnel = [
    {
      label: "注册用户",
      count: totalUsers,
      icon: Users,
    },
    {
      label: "完成新人引导",
      count: onboardingUsers,
      icon: Sparkles,
    },
    {
      label: "创建第一个任务",
      count: createdTaskUsers,
      icon: FolderKanban,
    },
    {
      label: "完成第一个任务",
      count: completedTaskUsers,
      icon: CheckCircle2,
    },
    {
      label: "写过复盘",
      count: reviewedUsers,
      icon: NotebookPen,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="使用情况"
        description="仅供创建者查看的关键指标和用户漏斗"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/projects"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              <FolderKanban className="size-4" />
              项目数据
            </Link>
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
            >
              <ArrowLeft className="size-4" />
              返回走走
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Users}
          label="注册用户"
          value={String(totalUsers)}
        />
        <MetricCard
          icon={Activity}
          label="今日活跃"
          value={String(activeToday)}
        />
        <MetricCard
          icon={Activity}
          label="7 日活跃"
          value={String(activeWeek)}
        />
        <MetricCard
          icon={Activity}
          label="30 日活跃"
          value={String(activeMonth)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">用户漏斗</h2>
          <div className="mt-4 space-y-3">
            {funnel.map((item, index) => {
              const Icon = item.icon;
              const percent =
                index === 0
                  ? 100
                  : totalUsers
                    ? Math.round((item.count / totalUsers) * 100)
                    : 0;
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-ink-secondary">
                      <Icon className="size-4 shrink-0 text-accent" />
                      {item.label}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {item.count} 人 · {percent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">AI 成本</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs text-ink-secondary">今日调用</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {aiToday._count._all}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">今日 token</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {aiToday._sum.totalTokens ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">今日缓存命中</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {todayHitTokens}
                <span className="ml-2 text-sm font-normal text-ink-secondary">
                  / 未命中 {todayMissTokens}
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {todayCacheRate === null
                  ? "暂无缓存数据"
                  : `命中率 ${todayCacheRate}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">近 30 天调用</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {aiMonth._count._all}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">近 30 天 token</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {aiMonth._sum.totalTokens ?? 0}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">近 14 天活跃</h2>
        <div className="mt-4 space-y-2">
          {dailyActive.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs text-ink-muted">
                {item.label}
              </span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-surface-muted">
                <div
                  className="h-full rounded bg-accent/80"
                  style={{
                    width: `${Math.max((item.count / maxDaily) * 100, item.count ? 4 : 0)}%`,
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-ink-secondary">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">页面访问</h2>
          {topPages.length ? (
            <div className="mt-3 divide-y divide-border">
              {topPages.map(([page, count]) => (
                <div
                  key={page}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="truncate text-ink">{page}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">暂无页面访问记录</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">最近用户</h2>
          {recentUsers.length ? (
            <div className="mt-3 divide-y divide-border">
              {recentUsers.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="truncate text-ink">{item.username}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {item._count.tasks} 任务 · {item._count.reviews} 复盘 ·{" "}
                    {item.createdAt.toLocaleDateString("zh-CN")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">暂无用户</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">最近事件</h2>
        {recentEvents.length ? (
          <div className="mt-3 divide-y divide-border">
            {recentEvents.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-ink">
                  {item.user.username} · {item.event}
                  {item.page ? ` · ${item.page}` : ""}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {item.createdAt.toLocaleString("zh-CN", {
                    hour12: false,
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            暂无事件，用户开始使用后会自动记录
          </p>
        )}
      </section>

      <p className="text-xs leading-5 text-ink-muted">
        当前时间：{now.toLocaleString("zh-CN", { hour12: false })}。管理员身份必须配置
        ADMIN_USERNAME 环境变量后才能访问。
      </p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        <Icon className="size-3.5 text-accent" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">无权访问</h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          这个页面只对创建者或管理员开放。
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          <ArrowLeft className="size-4" />
          返回走走
        </Link>
      </div>
    </div>
  );
}
