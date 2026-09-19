import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [projects, tasks, inboxItems, reviews] = await Promise.all([
    prisma.project.findMany({ where: { userId: user.id }, include: { tasks: true }, orderBy: { updatedAt: "desc" } }),
    prisma.task.findMany({ where: { userId: user.id }, include: { project: true, inboxItem: true }, orderBy: { createdAt: "desc" } }),
    prisma.inboxItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.review.findMany({ where: { userId: user.id }, include: { tasks: true, nextActionTasks: true }, orderBy: { reviewDate: "desc" } }),
  ]);

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    projects,
    tasks,
    inboxItems,
    reviews,
  });
}