import { prisma } from "@/lib/prisma";
import type { TodaySuggestion } from "@/lib/ai";
import { resolveFirstRunState, type FirstRunState } from "@/lib/first-run";
import { FIRST_RUN_PREFERENCE } from "@/lib/preferences";
import { toDateInputValue } from "@/lib/date";

const TODAY_FOCUS_KEY = "today_focus";
const TODAY_FOCUS_SOURCE = "ai";

export type PendingInboxItem = {
  id: string;
  content: string;
  aiPlanJson: string | null;
  aiSuggestionJson: string | null;
};

export type HomeSupport = {
  firstRun: FirstRunState;
  focusSuggestions: TodaySuggestion[] | null;
  pendingInbox: PendingInboxItem[];
};

/**
 * 首页渲染需要的全部背景数据，一次往返取回。
 *
 * 之前这里要发 6~7 条查询（新手状态 3 条 + 待整理 + 今日推荐 + 任务列表），
 * 而跨洋链路上查询一多就互相拖慢：3 条计数单独跑只要 700ms，一起跑要 2.4 秒。
 * 合成一条 SQL 后首页的读路径只剩「这条 + 任务列表」两次往返。
 * 2026-10-15 起把 users.createdAt 也并进这条 SQL，首页读路径进一步收敛到 1 次往返。
 */
const HOME_SUPPORT_SQL = `
WITH pref AS (
  SELECT key, value
  FROM user_preferences
  WHERE "userId" = $1
    AND ((key = $2 AND source = $3) OR (key = $4 AND source = $5))
),
inbox AS (
  SELECT id, content, "aiPlanJson", "aiSuggestionJson"
  FROM inbox_items
  WHERE "userId" = $1 AND status = 'inbox'
  ORDER BY "createdAt" DESC
  LIMIT 10
)
SELECT
  (SELECT COALESCE(json_agg(pref), '[]'::json) FROM pref) AS preferences,
  (SELECT count(*) FROM projects WHERE "userId" = $1) AS "projectCount",
  (SELECT count(*) FROM tasks WHERE "userId" = $1) AS "taskCount",
  (SELECT COALESCE(json_agg(inbox), '[]'::json) FROM inbox) AS inbox,
  (SELECT "createdAt" FROM users WHERE id = $1) AS "userCreatedAt"
`;

type HomeSupportRow = {
  preferences: Array<{ key: string; value: string }> | null;
  projectCount: number | string;
  taskCount: number | string;
  inbox: PendingInboxItem[] | null;
  userCreatedAt: Date | string | null;
};

export async function loadHomeSupport(input: {
  userId: string;
  now: Date;
}): Promise<HomeSupport> {
  const rows = await prisma.$queryRawUnsafe<HomeSupportRow[]>(
    HOME_SUPPORT_SQL,
    input.userId,
    FIRST_RUN_PREFERENCE.key,
    FIRST_RUN_PREFERENCE.source,
    TODAY_FOCUS_KEY,
    TODAY_FOCUS_SOURCE,
  );
  const row = rows[0];

  const preferences = new Map(
    (row?.preferences ?? []).map((item) => [item.key, item.value]),
  );

  // 判定规则走 first-run.ts 里的同一条，避免两处走样。
  const firstRun = resolveFirstRunState({
    createdAt: row?.userCreatedAt ? new Date(row.userCreatedAt) : null,
    tourValue: preferences.get(FIRST_RUN_PREFERENCE.key) ?? null,
    projectCount: Number(row?.projectCount ?? 0),
    taskCount: Number(row?.taskCount ?? 0),
  });

  // 与 readTodayFocus 保持完全一致的解析。
  let focusSuggestions: TodaySuggestion[] | null = null;
  const storedFocus = preferences.get(TODAY_FOCUS_KEY);
  if (storedFocus) {
    try {
      const payload = JSON.parse(storedFocus) as {
        date?: string;
        suggestions?: unknown;
      };
      if (
        payload.date === toDateInputValue(input.now) &&
        Array.isArray(payload.suggestions)
      ) {
        focusSuggestions = payload.suggestions as TodaySuggestion[];
      }
    } catch {
      focusSuggestions = null;
    }
  }

  return {
    firstRun,
    focusSuggestions,
    pendingInbox: row?.inbox ?? [],
  };
}
