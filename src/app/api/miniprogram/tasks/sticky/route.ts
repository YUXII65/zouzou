import { NextResponse } from "next/server";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { generateTaskCoachAdvice } from "@/lib/ai";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { serializeTaskStickyNote } from "@/lib/task-sticky";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim();
  if (!taskId) return NextResponse.json({ error: "missing_task_id" }, { status: 400 });
  const task = await prisma.task.findFirst({ where: { id: taskId, userId: user.id }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const notes = await prisma.taskStickyNote.findMany({ where: { userId: user.id, taskId }, orderBy: { createdAt: "desc" }, take: 10 });
  return NextResponse.json({ notes: notes.map(serializeTaskStickyNote) });
}

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { taskId?: string; message?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const taskId = body.taskId?.trim();
  const task = taskId ? await prisma.task.findFirst({ where: { id: taskId, userId: user.id }, select: { id: true, title: true, notes: true, status: true, project: { select: { name: true } } } }) : null;
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const message = body.message?.trim() || "这个任务我还没有头绪，请给我一个能直接开始的行动方案";
  const aiContext = await buildAiContext({ kind: "task_coach", taskId: task.id, userId: user.id });
  try {
    const advice = await withAiQuota("task_coach", () => generateTaskCoachAdvice({ title: task.title, notes: task.notes, projectName: task.project?.name ?? null, status: task.status, message }, aiContext.summary, aiContext.evidence));
    const note = await prisma.taskStickyNote.create({ data: { userId: user.id, taskId: task.id, sourceMessage: message, title: advice.title, encouragement: advice.encouragement, stepsJson: JSON.stringify(advice.steps), nextStep: advice.nextStep } });
    const overflow = await prisma.taskStickyNote.findMany({ where: { userId: user.id, taskId: task.id, id: { not: note.id } }, orderBy: { createdAt: "desc" }, skip: 9, select: { id: true } });
    if (overflow.length) await prisma.taskStickyNote.deleteMany({ where: { id: { in: overflow.map((item) => item.id) } } });
    return NextResponse.json({ note: serializeTaskStickyNote(note) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ai_error" }, { status: 500 });
  }
}