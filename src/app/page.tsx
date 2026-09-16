import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Clock3,
  Focus,
  ListTodo,
  NotebookPen,
} from "lucide-react";
import { CalendarDatePanel } from "@/components/calendar-date-panel";
import { FirstRunTour } from "@/components/first-run-tour";
import { FirstTaskReviewHint } from "@/components/first-task-review-hint";
import { Panel, PanelHeader } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { TodayTaskActions } from "@/components/today-task-actions";
import { TaskTitleButton } from "@/components/task-title-button";
import { AiTaskPlanner } from "@/components/ai-task-planner";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getFirstRunState } from "@/lib/first-run";
import { serializeTaskStickyNote } from "@/lib/task-sticky";
import {
  endOfDay,
  formatDate,
  isSameDay,
  startOfDay,
  toDateInputValue,
} from "@/lib/date";

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type AgendaTask = {
  id: string;
  title: string;
  shortTitle: string | null;
  notes: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  scheduledDate: Date | null;
  focusDate: Date | null;
  stickyNotes: Array<{
    id: string;
    taskId: string;
    sourceMessage: string;
    title: string;
    encouragement: string;
    stepsJson: string;
    nextStep: string;
    createdAt: Date;
  }>;
  project: { name: string } | null;
  inboxItem: { id: string } | null;
  reviewNextAction: {
    review: { reviewDate: Date };
  } | null;
};

function taskSource(task: AgendaTask) {
  return task.project?.name ?? "未关联项目";
}

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/landing");
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const [firstRun, tasks, pendingInbox, reviewCount, recentReviews] =
    await Promise.all([
      getFirstRunState(user.id, user.createdAt),
      prisma.task.findMany({
        where: { userId: user.id },
        include: {
          project: { select: { name: true } },
          inboxItem: { select: { id: true } },
          reviewNextAction: {
            select: {
              review: { select: { reviewDate: true } },
            },
          },
          stickyNotes: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.inboxItem.findMany({
        where: { userId: user.id, status: "inbox" },
        select: {
          id: true,
          content: true,
          aiPlanJson: true,
          aiSuggestionJson: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.review.count({ where: { userId: user.id } }),
      prisma.review.findMany({
        where: { userId: user.id },
        select: { reviewDate: true },
        orderBy: { reviewDate: "desc" },
        take: 60,
      }),
    ]);

  const activityDates = new Set<string>();
  for (const task of tasks) {
    if (task.completedAt) activityDates.add(toDateInputValue(task.completedAt));
  }
  for (const review of recentReviews) {
    activityDates.add(toDateInputValue(review.reviewDate));
  }

  const streak = computeStreak(activityDates, now);
  const weekStart = startOfDay(
    new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
  );
  const weekDone = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      task.completedAt >= weekStart,
  ).length;

  const openTasks = tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );
  const completedToday = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      task.completedAt >= dayStart &&
      task.completedAt <= dayEnd,
  ).length;
  const totalToday = completedToday + openTasks.length;
  const agenda = [...openTasks].sort((a, b) => {
    function rank(task: AgendaTask) {
      if (task.focusDate && isSameDay(task.focusDate, now)) return 0;
      if (task.dueDate && task.dueDate < dayStart) return 1;
      if (
        task.scheduledDate &&
        task.scheduledDate >= dayStart &&
        task.scheduledDate <= dayEnd
      ) {
        return 2;
      }
      return 3;
    }

    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return (
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
    );
  });

  const todayRelevant = agenda.filter((task) => {
    if (task.focusDate && isSameDay(task.focusDate, now)) return true;
    if (task.dueDate && task.dueDate < dayStart) return true;
    if (
      task.scheduledDate &&
      task.scheduledDate >= dayStart &&
      task.scheduledDate <= dayEnd
    ) {
      return true;
    }
    return false;
  });

  const todayTasks = (todayRelevant.length ? todayRelevant : agenda).slice(0, 3);
  const firstTaskReviewEligible =
    tasks.some((task) => task.status === "done") && reviewCount === 0;

  return (
    <>
      {firstRun.isFirstRun ? (
        <FirstRunTour
          initialStep={firstRun.tourStep}
          context="home"
          hasTasks={tasks.length > 0}
        />
      ) : null}
      <FirstTaskReviewHint eligible={firstTaskReviewEligible} />
      <CalendarDatePanel
        now={now}
        completedToday={completedToday}
        totalToday={totalToday}
        streak={streak}
        weekDone={weekDone}
      />

      <Panel>
        <AiTaskPlanner
          pending={pendingInbox}
          quotaManaged={process.env.AI_QUOTA_ENABLED === "true"}
        />
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="今天要做"
          icon={ListTodo}
          action={
            <span className="text-xs font-medium text-ink-muted">
              {todayTasks.length} 条
            </span>
          }
        />
        {todayTasks.length ? (
          <div className="divide-y divide-border">
            {todayTasks.map((task) => (
              <AgendaTaskRow
                key={task.id}
                task={task}
                now={now}
                dayStart={dayStart}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Focus}
            title="今天还没有重点"
            hint="先记录一个想法，会先听懂你，再帮你拆成今天能做的事。"
            action={
              <a
                href="#quick-capture"
                className="zouzou-primary-button inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                记一个想法
                <ArrowRight className="size-4" />
              </a>
            }
          />
        )}
      </Panel>

      <div className="mt-6 flex justify-end">
        <Link
          href="/review"
          className="zouzou-secondary-button inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
        >
          去复盘
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </>
  );
}

function computeStreak(dates: Set<string>, now: Date) {
  let cursor = startOfDay(now);
  if (!dates.has(toDateInputValue(cursor))) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  let streak = 0;
  while (dates.has(toDateInputValue(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

function AgendaTaskRow({
  task,
  now,
  dayStart,
}: {
  task: AgendaTask;
  now: Date;
  dayStart: Date;
}) {
  const isFocused = task.focusDate && isSameDay(task.focusDate, now);
  const isOverdue = task.dueDate && task.dueDate < dayStart;
  const isScheduled =
    task.scheduledDate &&
    task.scheduledDate >= dayStart &&
    task.scheduledDate <= endOfDay(now);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isFocused ? (
            <span className="inline-flex h-5 items-center gap-1 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent-strong">
              <Focus className="size-3" />
              重点
            </span>
          ) : null}
          {isOverdue ? (
            <span className="inline-flex h-5 items-center gap-1 rounded bg-danger/10 px-1.5 text-[11px] font-medium text-danger">
              <Clock3 className="size-3" />
              逾期
            </span>
          ) : null}
          {isScheduled ? (
            <span className="inline-flex h-5 items-center gap-1 rounded bg-surface-muted px-1.5 text-[11px] font-medium text-ink-secondary">
              <ListTodo className="size-3" />
              计划
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <TaskTitleButton
              taskId={task.id}
              title={task.title}
              shortTitle={task.shortTitle}
              notes={task.notes}
              projectName={task.project?.name ?? null}
              status={task.status}
            />
          </div>
        </div>
        <p className="mt-1 truncate text-xs text-ink-secondary">
          {taskSource(task)}
        </p>
        {task.dueDate ? (
          <p className="mt-1 text-xs text-danger">截止 {formatDate(task.dueDate)}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={task.priority} />
        <TodayTaskActions
          taskId={task.id}
          status={task.status}
          focused={Boolean(isFocused)}
          title={task.title}
          notes={task.notes}
          projectName={task.project?.name ?? null}
          initialStickyNotes={task.stickyNotes.map(serializeTaskStickyNote)}
        />
      </div>
    </div>
  );
}
