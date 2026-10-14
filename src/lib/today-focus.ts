import { prisma } from "@/lib/prisma";
import type { TodaySuggestion } from "@/lib/ai";
import { toDateInputValue } from "@/lib/date";

/**
 * 「今天要做」的按天缓存。
 *
 * 规则兜底能保证首页永远有内容，但「今天先做哪几件」需要模型取舍。
 * 缓存让当天的推荐保持稳定：当天首次生成后固定下来，之后刷新首页直接复用，
 * 既省掉重复调用，也避免列表每刷新一次就换一套。
 */
const PREFERENCE_KEY = "today_focus";
const PREFERENCE_SOURCE = "ai";

type TodayFocusPayload = {
  date: string;
  suggestions: TodaySuggestion[];
  generatedAt: string;
};

export async function readTodayFocus(
  userId: string,
  now: Date = new Date(),
): Promise<TodaySuggestion[] | null> {
  const row = await prisma.userPreference.findUnique({
    where: {
      userId_key_source: {
        userId,
        key: PREFERENCE_KEY,
        source: PREFERENCE_SOURCE,
      },
    },
    select: { value: true },
  });
  if (!row) return null;

  try {
    const payload = JSON.parse(row.value) as TodayFocusPayload;
    if (payload.date !== toDateInputValue(now)) return null;
    if (!Array.isArray(payload.suggestions)) return null;
    return payload.suggestions;
  } catch {
    return null;
  }
}

export async function writeTodayFocus(
  userId: string,
  suggestions: TodaySuggestion[],
  now: Date = new Date(),
): Promise<void> {
  const payload: TodayFocusPayload = {
    date: toDateInputValue(now),
    suggestions,
    generatedAt: now.toISOString(),
  };
  const value = JSON.stringify(payload);

  await prisma.userPreference.upsert({
    where: {
      userId_key_source: {
        userId,
        key: PREFERENCE_KEY,
        source: PREFERENCE_SOURCE,
      },
    },
    update: { value },
    create: {
      userId,
      key: PREFERENCE_KEY,
      source: PREFERENCE_SOURCE,
      value,
    },
  });
}