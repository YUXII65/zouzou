import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { noteId?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const noteId = body.noteId?.trim();
  if (!noteId) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const deleted = await prisma.taskStickyNote.deleteMany({ where: { id: noteId, userId: user.id } });
  return NextResponse.json({ ok: deleted.count > 0 });
}