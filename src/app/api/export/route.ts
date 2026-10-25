import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const [projects, tasks, inboxItems, reviews] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id },
      include: {
        tasks: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.task.findMany({
      where: { userId: user.id },
      include: {
        project: true,
        inboxItem: true,
        checkinCompletions: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.inboxItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.findMany({
      where: { userId: user.id },
      include: {
        tasks: true,
        nextActionTasks: true,
      },
      orderBy: { reviewDate: "desc" },
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    projects,
    tasks,
    inboxItems,
    reviews,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="next-step-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
