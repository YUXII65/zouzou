import { prisma } from "@/lib/prisma";
import { issueSessionToken, readSessionToken } from "@/lib/session";

export async function getMiniProgramUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
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
    },
  });
}

export function bearerSessionToken(userId: string) {
  return issueSessionToken(userId);
}