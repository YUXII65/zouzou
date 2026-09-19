import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { endOfDay, toDateInputValue } from "@/lib/date";

export const dynamic = "force-dynamic";

function parseDateInput(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = parseDateInput(url.searchParams.get("date"));
  if (!date) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const reviews = await prisma.review.findMany({
    where: { userId: user.id },
    include: {
      tasks: {
        include: { project: { select: { name: true } } },
      },
      nextActionTasks: {
        include: { task: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { reviewDate: "desc" },
  });

  const selected = reviews.find(
    (review) => toDateInputValue(review.reviewDate) === toDateInputValue(date),
  );
  const reviewHasNewCompletions = selected
    ? (await prisma.task.count({
        where: {
          userId: user.id,
          status: "done",
          completedAt: {
            gt: selected.updatedAt,
            lte: endOfDay(selected.reviewDate),
          },
        },
      })) > 0
    : false;

  const weekStart = startOfWeek(new Date());
  const weekReviews = reviews.filter((review) => review.reviewDate >= weekStart);
  const weekCompleted = weekReviews.flatMap((review) =>
    review.tasks.filter((task) => task.statusAtReview === "done"),
  ).length;
  const weekOpen = weekReviews.flatMap((review) =>
    review.tasks.filter(
      (task) =>
        task.statusAtReview !== "done" && task.statusAtReview !== "cancelled",
    ),
  ).length;
  const weekProjects = new Set(
    weekReviews
      .flatMap((review) => review.tasks)
      .map((task) => task.project?.name)
      .filter(Boolean),
  ).size;

  return NextResponse.json({
    review: selected
      ? {
          id: selected.id,
          summary: selected.summary,
          nextActions: selected.nextActions,
          status: selected.status,
          tasks: selected.tasks.map((task) => ({
            id: task.id,
            title: task.titleAtReview,
            status: task.statusAtReview,
            projectName: task.project?.name ?? null,
          })),
          nextActionTitles: selected.nextActionTasks.map((action) => action.title),
        }
      : null,
    reviews: reviews.map((review) => {
      const completedCount = review.tasks.filter(
        (task) => task.statusAtReview === "done",
      ).length;
      return {
        id: review.id,
        date: toDateInputValue(review.reviewDate),
        status: review.status,
        completedCount,
        openCount: Math.max(review.tasks.length - completedCount, 0),
      };
    }),
    weekStats: {
      weekReviewCount: weekReviews.length,
      weekCompleted,
      weekOpen,
      weekProjects,
    },
    reviewSavedAlready: selected?.status === "final" && !reviewHasNewCompletions,
  });
}