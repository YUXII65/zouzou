import { prisma } from "@/lib/prisma";
import { issueSessionToken, readSessionToken } from "@/lib/session";

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export async function getMiniProgramUserByToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const userId = readSessionToken(trimmed);
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });
}

export async function getMiniProgramUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return null;

  return getMiniProgramUserByToken(token);
}

export function bearerSessionToken(userId: string) {
  return issueSessionToken(userId);
}