import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const statuses = ["active", "paused", "completed", "archived"] as const;

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { projectId?: string; name?: string; objective?: string; currentMilestone?: string; status?: string; notes?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const projectId = body.projectId?.trim();
  const name = body.name?.trim();
  const objective = body.objective?.trim();
  if (!projectId || !name || !objective) return NextResponse.json({ error: "invalid_project" }, { status: 400 });

  const existing = await prisma.project.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.project.update({
    where: { id: existing.id, userId: user.id },
    data: {
      name: name.slice(0, 80),
      objective: objective.slice(0, 500),
      currentMilestone: body.currentMilestone?.trim().slice(0, 300) || null,
      status: statuses.includes(body.status as (typeof statuses)[number]) ? (body.status as (typeof statuses)[number]) : "active",
      notes: body.notes?.trim().slice(0, 1000) || null,
    },
  });

  return NextResponse.json({ ok: true });
}