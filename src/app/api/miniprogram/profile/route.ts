import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { normalizeProjectMode, type ProjectMode } from "@/lib/work-mode";
import { isOpenTaskStatus } from "@/lib/task-flow";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    select: {
      mode: true,
      tasks: { select: { status: true } },
    },
  });

  const counts: Record<ProjectMode, number> = {
    normal: 0,
    longterm: 0,
    explore: 0,
  };
  for (const project of projects) {
    const mode = normalizeProjectMode(project.mode);
    if (project.tasks.some((task) => isOpenTaskStatus(task.status))) {
      counts[mode] += 1;
    }
  }

  return NextResponse.json({
    user,
    counts,
    serverConnected: Boolean(
      process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    ),
  });
}
