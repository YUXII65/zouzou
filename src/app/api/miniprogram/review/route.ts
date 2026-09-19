import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/date";

export const dynamic = "force-dynamic";

function parseDateInput(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

  const review = await prisma.review.findUnique({
    where: { userId_reviewDate: { userId: user.id, reviewDate: startOfDay(date) } },
    include: {
      tasks: {
        include: { project: { select: { name: true } } },
      },
      nextActionTasks: {
        include: { task: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!review) {
    return NextResponse.json({ review: null });
  }

  return NextResponse.json({
    review: {
      id: review.id,
      summary: review.summary,
      nextActions: review.nextActions,
      status: review.status,
      tasks: review.tasks.map((task) => ({
        id: task.id,
        title: task.titleAtReview,
        status: task.statusAtReview,
        projectName: task.project?.name ?? null,
      })),
      nextActionTitles: review.nextActionTasks.map((action) => action.title),
    },
  });
}