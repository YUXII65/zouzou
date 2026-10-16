import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FolderKanban,
  ListChecks,
  TimerReset,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "项目数据",
};

export const dynamic = "force-dynamic";

const MODE_LABELS: Record<string, string> = {
  normal: "普通",
  longterm: "长期",
  explore: "探索",
};

const STATUS_LABELS: Record<string, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
};

export default async function AdminProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/projects");

  const admin = await getAdminUser();
  if (!admin) return <NotAuthorized />;

  const [totalProjects, activeProjects, totalTasks, doneTasks, projects] =
    await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: "active" } }),
      prisma.task.count(),
      prisma.task.count({ where: { status: "done" } }),
      prisma.project.findMany({
        take: 200,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          objective: true,
          mode: true,
          status: true,
          currentMilestone: true,
          updatedAt: true,
          user: { select: { username: true } },
          tasks: { select: { status: true } },
          _count: { select: { stages: true, tracks: true } },
        },
      }),
    ]);

  const rows = projects.map((project) => {
    const done = project.tasks.filter((task) => task.status === "done").length;
    const cancelled = project.tasks.filter(
      (task) => task.status === "cancelled",
    ).length;
    return {
      ...project,
      taskTotal: project.tasks.length,
      taskDone: done,
      taskOpen: project.tasks.length - done - cancelled,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目数据"
        description="查看所有账号当前的项目、任务推进量和最近更新时间"
        action={
          <Link
            href="/admin"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
          >
            <ArrowLeft className="size-4" />
            返回使用情况
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={FolderKanban} label="项目总数" value={totalProjects} />
        <Metric icon={TimerReset} label="进行中项目" value={activeProjects} />
        <Metric icon={ListChecks} label="任务总数" value={totalTasks} />
        <Metric icon={CheckCircle2} label="已完成任务" value={doneTasks} />
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">项目明细</h2>
            <p className="mt-1 text-xs text-ink-muted">
              最近更新优先，最多显示 200 个项目
            </p>
          </div>
          <span className="text-xs text-ink-muted">
            共 {totalProjects} 个项目
          </span>
        </div>

        {rows.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-ink-muted">
                  <th className="px-2 py-2 font-medium">项目</th>
                  <th className="px-2 py-2 font-medium">账号</th>
                  <th className="px-2 py-2 font-medium">模式</th>
                  <th className="px-2 py-2 font-medium">状态</th>
                  <th className="px-2 py-2 font-medium">任务</th>
                  <th className="px-2 py-2 font-medium">结构</th>
                  <th className="px-2 py-2 font-medium">最近更新</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((project) => (
                  <tr key={project.id} className="align-top">
                    <td className="max-w-[320px] px-2 py-3">
                      <p className="font-medium text-ink">{project.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">
                        {project.objective}
                      </p>
                      {project.currentMilestone ? (
                        <p className="mt-1 line-clamp-1 text-xs text-ink-secondary">
                          当前里程碑：{project.currentMilestone}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-ink-secondary">
                      {project.user.username}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-ink-secondary">
                      {MODE_LABELS[project.mode] ?? project.mode}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-ink-secondary">
                      {STATUS_LABELS[project.status] ?? project.status}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-ink-secondary">
                      {project.taskDone}/{project.taskTotal} 完成
                      <span className="ml-1 text-xs text-ink-muted">
                        · 待办 {project.taskOpen}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-xs text-ink-muted">
                      {project._count.stages} 阶段 · {project._count.tracks} 线路
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-xs text-ink-muted">
                      {project.updatedAt.toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-surface-muted px-4 py-8 text-center text-sm text-ink-muted">
            暂无项目数据
          </p>
        )}
      </section>

      <p className="text-xs leading-5 text-ink-muted">
        当前时间：{new Date().toLocaleString("zh-CN", { hour12: false })}。
        这里只显示项目结构和任务统计，不展示任务正文。
      </p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: number;
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