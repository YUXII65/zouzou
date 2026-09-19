import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { projectId?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const projectId = body.projectId?.trim();
  if (!projectId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const existing = await prisma.project.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.project.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}