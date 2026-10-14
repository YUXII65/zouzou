import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ONBOARDING_PREFERENCE } from "@/lib/preferences";
import {
  issueSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}

export function isGuestUser(user: { username: string }) {
  return user.username.startsWith("guest_");
}

export const getCurrentUser = cache(async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = readSessionToken(token);
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      createdAt: true,
      _count: {
        select: {
          tasks: { where: { status: "done" } },
        },
      },
      userPreferences: {
        where: {
          key: ONBOARDING_PREFERENCE.key,
          source: ONBOARDING_PREFERENCE.source,
        },
        select: { value: true },
        take: 1,
      },
    },
  });
});

/**
 * 只要 userId 的路径用它。
 *
 * session cookie 本身就是 HMAC 签名 + 带过期时间，直接解就能拿到 userId；
 * 没必要像 getCurrentUser() 那样再查一次 users（跨洋 ~200~700ms）。
 * 区别是它不校验用户是否还存在——后续针对该 userId 的读写会自然失败，
 * 对这种"解析参数就往下走"的接口足够。
 */
export async function readSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function createUserSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, issueSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroyUserSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
