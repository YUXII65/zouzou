import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth";
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

  if (username.length < 2 || username.length > 20 || !password) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        passwordHash: true,
      },
    });

    if (existing) {
      if (!verifyPassword(password, existing.passwordHash)) {
        return NextResponse.json(
          { error: "invalid_credentials" },
          { status: 401 },
        );
      }

      try {
        await recordUsageEvent({
          userId: existing.id,
          event: "login",
          page: "miniprogram",
        });
      } catch {
        // 统计失败不影响登录。
      }

      return NextResponse.json({
        token: bearerSessionToken(existing.id),
        user: {
          id: existing.id,
          username: existing.username,
          displayName: existing.displayName,
          avatarUrl: existing.avatarUrl,
        },
      });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401 },
      );
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

    try {
      await recordUsageEvent({
        userId: user.id,
        event: "register",
        page: "miniprogram",
      });
    } catch {
      // 统计失败不影响注册。
    }

    return NextResponse.json({
      token: bearerSessionToken(user.id),
      user,
    });
  } catch (error) {
    console.error("[miniprogram-auth:login]", error);
    return NextResponse.json(
      { error: "service_unavailable" },
      { status: 503 },
    );
  }
}
