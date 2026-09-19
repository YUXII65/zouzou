import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
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
    return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "username_exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  await recordUsageEvent({ userId: user.id, event: "register", page: "miniprogram" });

  return NextResponse.json({
    token: bearerSessionToken(user.id),
    user,
  });
}