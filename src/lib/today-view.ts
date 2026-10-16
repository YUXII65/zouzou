import { prisma } from "@/lib/prisma";
import type { TodaySuggestion } from "@/lib/ai";
import { loadHomeSupport, type PendingInboxItem } from "@/lib/home-support";
import {
  normalizeStickySteps,
  serializeTaskStickyNote,
  type TaskStickyNoteData,
} from "@/lib/task-sticky";
import { endOfDay, isSameDay, startOfDay, toDateInputValue } from "@/lib/date";
import type { FirstRunState } from "@/lib/first-run";

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * 首页「今日视图」的唯一契约：网页和小程序都消费这一份。
 *
 * 之前网页在 page.tsx 里自己排序取任务，小程序在 miniprogram-today.ts 里又写了一套，
 * 同一件事两份定义，小程序因此一直看起来是旧版本。这里收敛成一份，两端只做渲染。
 * 日期字段在服务端是 Date，JSON 序列化后是小程序拿到的 ISO 字符串。
 */
export type TodayViewTask = {
  id: string;
  title: string;
  shortTitle: string | null;
  notes: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  scheduledDate: Date | null;
  focusDate: Date | null;
  completedAt: Date | null;
  projectName: string | null;
  doneWhen: string | null;
  methodHint: string | null;
  executionMode: string | null;
  stickyNotes: TaskStickyNoteData[];
  isFocused: boolean;
  isOverdue: boolean;
  isScheduled: boolean;
  reason: string | null;
};

export type TodayViewStats = {
  openTasks: number;
  completedToday: number;
  totalToday: number;
  weekDone: number;
  streak: number;
  reviewCount: number;
};

export type TodayView = {
  date: string;
  pendingInbox: PendingInboxItem[];
  plannedTasks: TodayViewTask[];
  completedTodayTasks: TodayViewTask[];
  stats: TodayViewStats;
  firstRun: FirstRunState;
  focusSuggestions: TodaySuggestion[] | null;
};

/**
 * 过渡期兼容：线上小程序还是旧包（读 pendingItems / tasks / completedToday 等字段名）。
 * 服务端同时在响应里带上这些旧字段，旧包不会因为契约升级而空列表。
 * 新包全量发布并观察一段时间后，可以删掉这个函数和两个调用点。
 */
export function withLegacyTodayFields(view: TodayView) {
  const legacyTasks = [
    ...view.plannedTasks,
    ...view.completedTodayTasks,
  ].map((task) => {
    const sticky = task.stickyNotes[0] ?? null;
    return {
      ...task,
      projectName: task.projectName ?? "未关联项目",
      dueDateText: task.dueDate ? toDateInputValue(task.dueDate) : "",
      sticky: sticky
        ? {
            id: sticky.id,
            title: sticky.title,
            encouragement: sticky.encouragement,
            steps: sticky.steps,
            nextStep: sticky.nextStep,
          }
        : null,
    };
  });

  return {
    ...view,
    pendingItems: view.pendingInbox,
    tasks: legacyTasks,
    completedToday: view.stats.completedToday,
    totalToday: view.stats.totalToday,
    openTasks: view.stats.openTasks,
    streak: view.stats.streak,
    weekDone: view.stats.weekDone,
    reviewCount: view.stats.reviewCount,
  };
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

export async function buildTodayView(input: {
  userId: string;
  now?: Date;
}): Promise<TodayView> {
  const now = input.now ?? new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [support, tasks, reviews, reviewCount] = await Promise.all([
    loadHomeSupport({ userId: input.userId, now }),
    prisma.task.findMany({
      where: { userId: input.userId },
      include: {
        project: { select: { name: true } },
        stickyNotes: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.findMany({
      where: { userId: input.userId },
      select: { reviewDate: true },
      orderBy: { reviewDate: "desc" },
      take: 60,
    }),
    prisma.review.count({ where: { userId: input.userId } }),
  ]);

  const { firstRun, focusSuggestions, pendingInbox } = support;

  const openTasks = tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );

  const agenda = [...openTasks].sort((a, b) => {
    function rank(task: (typeof openTasks)[number]) {
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
    return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
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

  const completedTodayTasks = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        task.completedAt &&
        task.completedAt >= dayStart &&
        task.completedAt <= dayEnd,
    )
    .sort(
      (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    )
    .slice(0, 5);

  // 今日建议的待办部分交给模型取舍：当天已有推荐时按推荐取，
  // 规则只在没有推荐时兜底、以及推荐名额因完成/取消空出来时补位。
  const ruleOrdered = todayRelevant.length ? todayRelevant : agenda;
  const openById = new Map(openTasks.map((task) => [task.id, task]));
  const recommendedOpen = (focusSuggestions ?? [])
    .map((item) => openById.get(item.taskId))
    .filter((task): task is (typeof openTasks)[number] => Boolean(task));
  const recommendedIds = new Set(recommendedOpen.map((task) => task.id));
  const backfill = ruleOrdered.filter((task) => !recommendedIds.has(task.id));
  const focusTarget = focusSuggestions ? Math.min(3, focusSuggestions.length) : 3;
  const plannedTasks = [...recommendedOpen, ...backfill].slice(0, focusTarget);

  const reasonByTaskId = new Map(
    (focusSuggestions ?? []).map((item) => [item.taskId, item.reason]),
  );

  function serializeTask(task: (typeof tasks)[number]): TodayViewTask {
    return {
      id: task.id,
      title: task.title,
      shortTitle: task.shortTitle,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
      focusDate: task.focusDate,
      completedAt: task.completedAt,
      projectName: task.project?.name ?? null,
      doneWhen: task.doneWhen,
      methodHint: task.methodHint,
      executionMode: task.executionMode,
      stickyNotes: task.stickyNotes.map((note) => {
        const serialized = serializeTaskStickyNote(note);
        return { ...serialized, steps: normalizeStickySteps(serialized) };
      }),
      isFocused: Boolean(task.focusDate && isSameDay(task.focusDate, now)),
      isOverdue: Boolean(task.dueDate && task.dueDate < dayStart),
      isScheduled: Boolean(
        task.scheduledDate &&
          task.scheduledDate >= dayStart &&
          task.scheduledDate <= dayEnd,
      ),
      reason: reasonByTaskId.get(task.id) ?? null,
    };
  }

  const activityDates = new Set<string>();
  for (const task of tasks) {
    if (task.completedAt) activityDates.add(toDateInputValue(task.completedAt));
  }
  for (const review of reviews) {
    activityDates.add(toDateInputValue(review.reviewDate));
  }

  const completedToday = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      task.completedAt >= dayStart &&
      task.completedAt <= dayEnd,
  ).length;
  const weekDone = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      task.completedAt >= weekStart,
  ).length;

  return {
    date: toDateInputValue(now),
    pendingInbox,
    plannedTasks: plannedTasks.map(serializeTask),
    completedTodayTasks: completedTodayTasks.map(serializeTask),
    stats: {
      openTasks: openTasks.length,
      completedToday,
      totalToday: completedToday + openTasks.length,
      weekDone,
      streak: computeStreak(activityDates, now),
      reviewCount,
    },
    firstRun,
    focusSuggestions,
  };
}