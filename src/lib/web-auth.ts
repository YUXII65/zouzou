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

type FindOrCreateResult =
  | { kind: "created"; user: { id: string } }
  | { kind: "existing"; user: { id: string } }
  | { kind: "short_password" }
  | { kind: "invalid_password" };

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

async function findOrCreateUser(
  username: string,
  password: string,
): Promise<FindOrCreateResult> {
  const existing = await findUser(username);
  if (existing) {
    if (!verifyPassword(password, existing.passwordHash)) {
      return { kind: "invalid_password" };
    }
    return { kind: "existing", user: { id: existing.id } };
  }

  if (password.length < 6) {
    return { kind: "short_password" };
  }

  try {
    const user = await prisma.user.create({
      data: { username, passwordHash: hashPassword(password) },
      select: { id: true },
    });
    return { kind: "created", user };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const raced = await findUser(username);
    if (raced && verifyPassword(password, raced.passwordHash)) {
      return { kind: "existing", user: { id: raced.id } };
    }
    return { kind: "invalid_password" };
  }
}

export async function handleWebAuth(request: Request, mode: WebAuthMode) {
  const fields = await readFields(request);
  if (!fields) {
    return redirectTo(authErrorPath(mode, "/", "system"));
  }

  const { username, password, next } = fields;
  if (!validUsername(username)) {
    return redirectTo(authErrorPath(mode, next, "invalid_username"));
  }
  if (!password) {
    return redirectTo(authErrorPath(mode, next, "password_required"));
  }

  try {
    const result = await findOrCreateUser(username, password);

    if (result.kind === "short_password") {
      return redirectTo(
        authErrorPath(mode, next, "register_short_password"),
      );
    }
    if (result.kind === "invalid_password") {
      return redirectTo(authErrorPath(mode, next, "invalid_password"));
    }

    try {
      await recordUsageEvent({
        userId: result.user.id,
        event: result.kind === "created" ? "register" : "login",
      });
    } catch {
      // 统计失败不阻塞登录注册。
    }

    if (result.kind === "created") {
      return redirectWithSession(
        "/welcome?signup=register",
        result.user.id,
      );
    }
    return redirectWithSession(next, result.user.id);
  } catch (error) {
    console.error(`[web-auth:${mode}]`, error);
    return redirectTo(authErrorPath(mode, next, "system"));
  }
}
