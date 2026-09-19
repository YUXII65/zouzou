import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, toDateInputValue, isSameDay } from "@/lib/date";

export const dynamic = "force-dynamic";

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

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

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [tasks, pendingItems, reviews, reviewCount] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id },
      include: {
        project: { select: { name: true } },
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
    prisma.review.findMany({
      where: { userId: user.id },
      select: { reviewDate: true },
      orderBy: { reviewDate: "desc" },
      take: 60,
    }),
    prisma.review.count({ where: { userId: user.id } }),
  ]);

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
  const weekDone = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      task.completedAt >= weekStart,
  ).length;

  const activityDates = new Set<string>();
  for (const task of tasks) {
    if (task.completedAt) activityDates.add(toDateInputValue(task.completedAt));
  }
  for (const review of reviews) {
    activityDates.add(toDateInputValue(review.reviewDate));
  }

  const agenda = [...openTasks]
    .sort((a, b) => {
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
    })
    .slice(0, 20)
    .map((task) => ({
      id: task.id,
      title: task.shortTitle || task.title,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      projectName: task.project?.name ?? "未关联项目",
      dueDate: task.dueDate?.toISOString() ?? null,
      scheduledDate: task.scheduledDate?.toISOString() ?? null,
      focusDate: task.focusDate?.toISOString() ?? null,
    }));

  return NextResponse.json({
    user,
    date: toDateInputValue(now),
    completedToday,
    totalToday,
    openTasks: openTasks.length,
    pendingInbox: pendingItems.length,
    pendingItems,
    reviewCount,
    streak: computeStreak(activityDates, now),
    weekDone,
    tasks: agenda,
  });
}