import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { bearerSessionToken } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { recordUsageEvent } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (username.length < 2 || username.length > 20 || password.length < 6) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      passwordHash: true,
    },
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await recordUsageEvent({ userId: user.id, event: "login", page: "miniprogram" });

  return NextResponse.json({
    token: bearerSessionToken(user.id),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  });
}