import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const VISITOR_COOKIE = "visitor_id";
const quotaStorage = new AsyncLocalStorage<{
  visitorId: string;
  feature: string;
  /** 调用方已经知道是哪个登录用户时带上，后面就不必再查一次 users 表。 */
  userId?: string;
}>();

export type AiUsageInput = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens?: number | null;
  promptCacheMissTokens?: number | null;
  model?: string | null;
};

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function isAiQuotaEnabled() {
  return process.env.AI_QUOTA_ENABLED === "true";
}

export function shouldUseClientAiOverrides() {
  return (
    !isAiQuotaEnabled() ||
    !(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY)
  );
}

export function getAiQuotaContext() {
  return quotaStorage.getStore();
}

export async function getVisitorId() {
  const user = await getCurrentUser();
  if (user) return `user:${user.id}`;

  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;

  const visitorId = randomUUID();
  cookieStore.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return visitorId;
}

export async function withAiQuota<T>(
  feature: string,
  fn: () => Promise<T>,
  userId?: string,
): Promise<T> {
  // 登录用户传了 userId 就直接用，免得再打一次跨洋的 users 查询。
  // getVisitorId() 对登录用户本来就返回 user:<id>，两者等价。
  const visitorId = userId ? `user:${userId}` : await getVisitorId();
  return quotaStorage.run({ visitorId, feature, userId }, fn);
}

function dailyStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function hasAiQuota() {
  const context = getAiQuotaContext();
  if (!context) return true;

  const visitorDailyCalls = intEnv("AI_QUOTA_VISITOR_DAILY_CALLS", 50);
  const visitorDailyTokens = intEnv("AI_QUOTA_VISITOR_DAILY_TOKENS", 200000);
  const dailyCalls = intEnv("AI_QUOTA_DAILY_CALLS", 500);
  const dailyTokens = intEnv("AI_QUOTA_DAILY_TOKENS", 1000000);

  const [visitorUsage, globalUsage] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where: {
        visitorId: context.visitorId,
        createdAt: { gte: dailyStart() },
      },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
    prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: dailyStart() } },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
  ]);

  const visitorCalls = visitorUsage._count._all;
  const visitorTokens = visitorUsage._sum.totalTokens ?? 0;
  const globalCalls = globalUsage._count._all;
  const globalTokens = globalUsage._sum.totalTokens ?? 0;

  if (visitorCalls >= visitorDailyCalls) return false;
  if (visitorTokens >= visitorDailyTokens) return false;
  if (globalCalls >= dailyCalls) return false;
  if (globalTokens >= dailyTokens) return false;

  return true;
}

export async function recordAiUsage(usage: AiUsageInput) {
  const context = getAiQuotaContext();
  if (!context) return;

  try {
    // 有 userId 就不用再查用户；没有（例如游客）才回退到 getCurrentUser。
    const userId = context.userId ?? (await getCurrentUser())?.id;
    if (!userId) return;
    await prisma.aiUsageLog.create({
      data: {
        userId,
        visitorId: context.visitorId,
        feature: context.feature,
        status: "ok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        promptCacheHitTokens: usage.promptCacheHitTokens ?? null,
        promptCacheMissTokens: usage.promptCacheMissTokens ?? null,
        model: usage.model ?? null,
      },
    });
  } catch {
    // Quota recording must never break an AI response.
  }
}

export async function estimateAiUsage(
  input: { system: string; user: string },
  output: string | null,
): Promise<AiUsageInput> {
  const promptTokens =
    Math.ceil(input.system.length / 4) + Math.ceil(input.user.length / 4);
  const completionTokens = output ? Math.ceil(output.length / 4) : 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
