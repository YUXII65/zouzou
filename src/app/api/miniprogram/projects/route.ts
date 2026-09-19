import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { name?: string; objective?: string; currentMilestone?: string; notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = body.name?.trim();
  const objective = body.objective?.trim();
  if (!name || !objective) {
    return NextResponse.json({ error: "missing_project_fields" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: name.slice(0, 80),
      objective: objective.slice(0, 500),
      currentMilestone: body.currentMilestone?.trim().slice(0, 300) || null,
      notes: body.notes?.trim().slice(0, 1000) || null,
    },
    select: {
      id: true,
      name: true,
      objective: true,
      status: true,
      currentMilestone: true,
      notes: true,
    },
  });

  return NextResponse.json({ project: { ...project, tasks: [] } });
}