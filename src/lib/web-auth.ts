import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordUsageEvent } from "@/lib/usage";
import {
  issueSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";

export type WebAuthMode = "login" | "register";

type AuthFields = {
  username: string;
  password: string;
  next: string;
};

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function safeNext(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/";
}

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

function redirectWithSession(path: string, userId: string) {
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: issueSessionToken(userId),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

function authErrorPath(mode: WebAuthMode, next: string, error?: string) {
  const params = new URLSearchParams({
    error: error ?? mode,
    next,
    mode,
  });
  return `/login?${params.toString()}`;
}

async function readFields(request: Request): Promise<AuthFields | null> {
  try {
    const formData = await request.formData();
    return {
      username: String(formData.get("username") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      next: safeNext(String(formData.get("next") ?? "/")),
    };
  } catch {
    return null;
  }
}

function validUsername(username: string) {
  return username.length >= 2 && username.length <= 20;
}

async function findUser(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true, passwordHash: true },
  });
}

async function createUser(username: string, password: string) {
  if (password.length < 6) return null;

  const passwordHash = hashPassword(password);
  try {
    return await prisma.user.create({
      data: { username, passwordHash },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return findUser(username);
  }
}

export async function handleWebAuth(request: Request, mode: WebAuthMode) {
  const fields = await readFields(request);
  if (!fields) {
    return redirectTo(authErrorPath(mode, "/", "system"));
  }

  const { username, password, next } = fields;
  if (!validUsername(username) || !password) {
    return redirectTo(authErrorPath(mode, next));
  }

  try {
    const existing = await findUser(username);
    if (existing) {
      if (!verifyPassword(password, existing.passwordHash)) {
        return redirectTo(authErrorPath(mode, next));
      }

      try {
        await recordUsageEvent({ userId: existing.id, event: "login" });
      } catch {
        // 登录不让统计失败阻塞。
      }
      return redirectWithSession(next, existing.id);
    }

    const created = await createUser(username, password);
    if (!created) {
      return redirectTo(authErrorPath(mode, next));
    }

    try {
      await recordUsageEvent({ userId: created.id, event: "register" });
    } catch {
      // 注册不让统计失败阻塞。
    }
    return redirectWithSession("/welcome?signup=register", created.id);
  } catch (error) {
    console.error(`[web-auth:${mode}]`, error);
    return redirectTo(authErrorPath(mode, next, "system"));
  }
}
