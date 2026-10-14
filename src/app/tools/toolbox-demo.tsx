"use client";

import { useEffect, useState } from "react";
import {
  Blocks,
  CalendarDays,
  Check,
  Clock3,
  Download,
  FolderKanban,
  Inbox,
  ListChecks,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageHint } from "@/components/page-hint";
import { Panel, PanelHeader } from "@/components/panel";

type StalledProject = {
  name: string;
  milestone: string | null;
  days: number;
};

type ToolboxInitialData = {
  pendingInbox: number;
  openTasks: number;
  doneTasks: number;
  feedbackCount: number;
  stalledProjects: StalledProject[];
  weekReviewCount: number;
  weekCompleted: number;
  weekOpen: number;
  weekProjects: number;
};

const modules = [
  {
    id: "focus",
    name: "专注计时",
    description: "给今日重点任务计时，避免一上午都在低效忙碌。",
    badge: "可用",
    icon: Clock3,
    available: true,
  },
  {
    id: "weekly",
    name: "周复盘",
    description: "每周回看项目推进情况，并自动生成下周重点。",
    badge: "可用",
    icon: ListChecks,
    available: true,
  },
  {
    id: "reminders",
    name: "日历提醒",
    description: "把今日计划和截止日期变成提醒，降低忘记打开的阻力。",
    badge: "暂不开放",
    icon: CalendarDays,
    available: false,
  },
  {
    id: "ai-execute",
    name: "AI 执行接入",
    description: "以后把可执行任务交给 Codex / WorkBuddy 等外部 Agent。",
    badge: "暂不开放",
    icon: Wand2,
    available: false,
  },
];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function FocusTimer() {
  const [modeSeconds, setModeSeconds] = useState(25 * 60);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (running && seconds === 0) {
      const timer = window.setTimeout(() => {
        setRunning(false);
        setFinished(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [running, seconds]);

  function chooseMode(minutes: number) {
    const next = minutes * 60;
    setModeSeconds(next);
    setSeconds(next);
    setRunning(false);
    setFinished(false);
  }

  return (
    <div className="zouzou-panel rounded-xl bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-ink-secondary">专注计时</p>
          <p
            className={
              finished
                ? "mt-1 text-2xl font-semibold text-accent"
                : "mt-1 text-2xl font-semibold tabular-nums text-ink"
            }
          >
            {finished ? "时间到" : formatTime(seconds)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[15, 25, 45].map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => chooseMode(minutes)}
              className={
                modeSeconds === minutes * 60
                  ? "inline-flex h-8 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white"
                  : "zouzou-secondary-button inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
              }
            >
              {minutes} 分钟
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (finished) {
              setSeconds(modeSeconds);
              setFinished(false);
            }
            setRunning((value) => !value);
          }}
          className="zouzou-primary-button inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
        >
          {running ? (
            <>
              <Pause className="size-3.5" />
              暂停
            </>
          ) : (
            <>
              <Play className="size-3.5" />
              开始
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setSeconds(modeSeconds);
            setRunning(false);
            setFinished(false);
          }}
          aria-label="重置计时"
          title="重置计时"
          className="zouzou-icon-button flex size-8 items-center justify-center rounded-md border border-border bg-surface text-ink-secondary transition-colors hover:border-accent hover:text-accent"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function WeeklySummary({ data }: { data: ToolboxInitialData }) {
  return (
    <div className="zouzou-panel rounded-xl bg-surface-muted p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-ink-secondary">本周复盘</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {data.weekReviewCount}
          </p>
        </div>
        <div>
          <p className="text-xs text-success">本周完成</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {data.weekCompleted}
          </p>
        </div>
        <div>
          <p className="text-xs text-warning">待推进</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {data.weekOpen}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-secondary">涉及项目</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {data.weekProjects}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ToolboxDemo({
  initialData,
  showHint = false,
}: {
  initialData: ToolboxInitialData;
  showHint?: boolean;
}) {
  const [enabled, setEnabled] = useState<string[]>([]);

  function toggleModule(id: string) {
    setEnabled((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <>
      <PageHeader
        title="工具匣"
      />

      <PageHint id="tools" title="提示" enabled={showHint}>
        需要什么再打开什么，核心流程保持简单。
      </PageHint>

      <Panel className="mb-6">
        <PanelHeader title="现状速览" icon={Sparkles} />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <Inbox className="size-3.5" />
              未整理想法
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {initialData.pendingInbox}
            </p>
          </div>
          <div className="rounded-xl border border-accent/20 bg-accent-soft/70 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-accent-strong">
              <ListChecks className="size-3.5" />
              未完成任务
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {initialData.openTasks}
            </p>
          </div>
          <div className="rounded-xl border border-success/20 bg-success/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <Check className="size-3.5" />
              已完成任务
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {initialData.doneTasks}
            </p>
          </div>
          <div className="rounded-xl border border-ai/20 bg-ai-soft/80 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
              <FolderKanban className="size-3.5" />
              本周复盘
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {initialData.weekReviewCount}
            </p>
          </div>
        </div>

        <div className="border-t border-border p-4">
          <p className="text-xs font-medium text-ink-secondary">需要关注</p>
          {initialData.stalledProjects.length ? (
            <div className="mt-2 space-y-2">
              {initialData.stalledProjects.slice(0, 3).map((project) => (
                <div
                  key={project.name}
                  className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-sm"
                >
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warning" />
                  <span className="text-ink">
                    {project.name} 已停 {project.days} 天
                    {project.milestone ? `，里程碑：${project.milestone}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              暂无停滞项目。
            </p>
          )}
          {initialData.feedbackCount > 0 ? (
            <p className="mt-3 text-xs text-ink-muted">
              已记录 {initialData.feedbackCount} 条 AI 反馈事件
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel className="mb-6">
        <PanelHeader
          title="推荐工具"
          icon={Blocks}
          action={
            <span className="text-xs font-medium text-ink-muted">
              已启用 {enabled.length} 个
            </span>
          }
        />
        <div className="divide-y divide-border">
          {modules.map((module) => {
            const active = enabled.includes(module.id);
            const Icon = module.icon;
            return (
              <div key={module.id}>
                <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-secondary">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">
                          {module.name}
                        </p>
                        <span
                          className={
                            module.available
                              ? "rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-strong"
                              : "rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted"
                          }
                        >
                          {module.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-ink-secondary">
                        {module.description}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={
                      module.available
                        ? () => toggleModule(module.id)
                        : undefined
                    }
                    disabled={!module.available}
                    className={
                      !module.available
                        ? "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-sm font-medium text-ink-muted disabled:cursor-not-allowed"
                        : active
                          ? "zouzou-primary-button inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
                          : "zouzou-secondary-button inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                    }
                  >
                    {module.available ? (
                      active ? (
                        <>
                          <Check className="size-3.5" />
                          已启用
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" />
                          启用
                        </>
                      )
                    ) : (
                      module.badge
                    )}
                  </button>
                </div>

                {active && module.id === "focus" ? (
                  <div className="border-t border-border p-4">
                    <FocusTimer />
                  </div>
                ) : null}
                {active && module.id === "weekly" ? (
                  <div className="border-t border-border p-4">
                    <WeeklySummary data={initialData} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="数据导出" icon={Download} />
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-ink-secondary">
            导出项目、任务、收件箱和复盘，方便备份或迁移。
          </p>
          <Link
            href="/api/export"
            className="zouzou-primary-button inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            <Download className="size-4" />
            导出 JSON
          </Link>
        </div>
      </Panel>
    </>
  );
}
