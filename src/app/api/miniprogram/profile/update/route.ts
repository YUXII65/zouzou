import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { displayName?: string; avatarUrl?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const displayName = body.displayName?.trim().slice(0, 30) || null;
  const avatarUrl =
    body.avatarUrl &&
    body.avatarUrl.startsWith("data:image/") &&
    body.avatarUrl.length <= 1000000
      ? body.avatarUrl
      : undefined;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    },
  });

  return NextResponse.json({ ok: true, displayName });
}