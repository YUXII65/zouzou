import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";

export type AiContextKind =
  | "inbox_plan"
  | "today_focus"
  | "review"
  | "task_coach"
  | "task_edit"
  | "project_edit";

export type AiContextInput = {
  userId: string;
  kind: AiContextKind;
  inboxItemId?: string;
  taskId?: string;
  projectId?: string;
};

export type ProjectPlanFact = {
  id: string;
  name: string;
  objective: string | null;
  currentMilestone: string | null;
  openTaskCount: number;
  openTasks: Array<{
    id: string;
    title: string;
    shortTitle: string | null;
    status: string;
  }>;
};

export type AiContext = {
  summary: string;
  evidence: string[];
  preferenceSummary: string;
  planningGuidance: string;
  maxPlanTasks: number;
  projectSummary: string;
  feedbackSummary: string;
  reviewSummary: string;
  taskHistorySummary: string;
  decisionMemory: string[];
  projectFacts: ProjectPlanFact[];
};


/**
 * 上下文缓存。
 *
 * 一条想法从澄清到生成计划会调用 buildAiContext 最多 5 次（澄清 1 + 每轮回答各 1 + 计划 1），
 * 而每次都要查 6 张表。数据库在跨洋链路上（单次往返 200ms+，整段 5~6 秒），重复查同样的背景
 * 数据是纯浪费。这些背景（项目 / 复盘 / 偏好 / 反馈）在几十秒内不会变，所以用短 TTL 缓存兜住，
 * 并在关键写入后主动失效。
 */
const AI_CONTEXT_TTL_MS = 60_000;
const aiContextCache = new Map<
  string,
  { value: AiContext; expiresAt: number }
>();

/** 数据变了就主动失效，不要等 TTL */
export function invalidateAiContext(userId?: string) {
  if (!userId) {
    aiContextCache.clear();
    return;
  }
  for (const key of [...aiContextCache.keys()]) {
    if (key.endsWith(":" + userId)) aiContextCache.delete(key);
  }
}

export async function buildAiContext(
  input: AiContextInput,
): Promise<AiContext> {
  const key = input.kind + ":" + input.userId;
  const hit = aiContextCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  const value = await buildAiContextUncached(input);
  // 简单清理，避免长期驻留
  if (aiContextCache.size > 100) {
    const now = Date.now();
    for (const [cacheKey, entry] of aiContextCache) {
      if (entry.expiresAt <= now) aiContextCache.delete(cacheKey);
    }
  }
  aiContextCache.set(key, { value, expiresAt: Date.now() + AI_CONTEXT_TTL_MS });
  return value;
}

/**
 * 一次查询取回全部背景数据。
 *
 * 跨洋链路上真正的成本是「往返次数 x 单次 RTT」，而且 Neon 这个端点在并发下会明显劣化：
 * 同样的 5 条查询，分开跑各约 460ms，一起跑要 4~5 秒。合成一条 SQL、一次往返最省。
 * 下游的格式化逻辑没有变，只是把取数从 5 个 Prisma 调用换成 1 个 json_agg。
 */
type ContextFetchRow = {
  preferences: Array<{
    key: string;
    value: string;
    source: string;
  }> | null;
  feedback: Array<{
    action: string;
    detail: string | null;
    taskTitle: string | null;
    inboxContent: string | null;
  }> | null;
  reviews: Array<{
    reviewDate: string;
    summary: string;
    nextActions: string | null;
    decisionJson: string | null;
  }> | null;
  projects: Array<{
    id: string;
    name: string;
    objective: string | null;
    currentMilestone: string | null;
    updatedAt: string;
    tasks: Array<{
      id: string;
      title: string;
      shortTitle: string | null;
      updatedAt: string;
      status: string;
    }>;
    openTaskCount: number | string;
    reviewDates: string[];
  }> | null;
  stickies: Array<{
    title: string;
    nextStep: string;
  }> | null;
};

const AI_CONTEXT_SQL = `
WITH pref AS (
  SELECT id, key, value, source, note, "updatedAt"
  FROM user_preferences
  WHERE "userId" = $1
  ORDER BY "updatedAt" DESC, id ASC
  LIMIT 20
),
fb AS (
  SELECT e.id, e.action, e.detail, e."createdAt",
         t.title AS "taskTitle",
         i.content AS "inboxContent"
  FROM ai_feedback_events e
  LEFT JOIN tasks t ON t.id = e."taskId"
  LEFT JOIN inbox_items i ON i.id = e."inboxItemId"
  WHERE e."userId" = $1
  ORDER BY e."createdAt" DESC, e.id ASC
  LIMIT 50
),
rv AS (
  SELECT id, "reviewDate", summary, "nextActions", "decisionJson"
  FROM reviews
  WHERE "userId" = $1
  ORDER BY "reviewDate" DESC, id ASC
  LIMIT 3
),
pr AS (
  SELECT id, name, objective, "currentMilestone", "updatedAt"
  FROM projects
  WHERE status = 'active' AND "userId" = $1
  ORDER BY "updatedAt" DESC, id ASC
  LIMIT 8
),
pt AS (
  SELECT id, "projectId", title, "shortTitle", "updatedAt", status
  FROM tasks
  WHERE "projectId" IN (SELECT id FROM pr)
    AND status IN ('todo', 'in_progress')
),
rt AS (
  SELECT review_tasks."projectId", r2."reviewDate"
  FROM review_tasks
  JOIN reviews r2 ON r2.id = review_tasks."reviewId"
  WHERE review_tasks."projectId" IN (SELECT id FROM pr)
),
st AS (
  SELECT id, title, "nextStep", "createdAt"
  FROM task_sticky_notes
  WHERE "userId" = $1
  ORDER BY "createdAt" DESC, id ASC
  LIMIT 6
)
SELECT
  (SELECT COALESCE(json_agg(pref ORDER BY pref."updatedAt" DESC, pref.id ASC), '[]'::json) FROM pref) AS preferences,
  (SELECT COALESCE(json_agg(fb ORDER BY fb."createdAt" DESC, fb.id ASC), '[]'::json) FROM fb) AS feedback,
  (SELECT COALESCE(json_agg(rv ORDER BY rv."reviewDate" DESC, rv.id ASC), '[]'::json) FROM rv) AS reviews,
  (SELECT COALESCE(json_agg(
      json_build_object(
        'id', pr.id,
        'name', pr.name,
        'objective', pr.objective,
        'currentMilestone', pr."currentMilestone",
        'updatedAt', pr."updatedAt",
        'tasks', COALESCE((
          SELECT json_agg(limited)
          FROM (
            SELECT pt.id, pt.title, pt."shortTitle", pt."updatedAt", pt.status
            FROM pt
            WHERE pt."projectId" = pr.id
            ORDER BY pt."updatedAt" DESC, pt.id ASC
            LIMIT 5
          ) limited
        ), '[]'::json),
        'openTaskCount', (SELECT count(*) FROM pt WHERE pt."projectId" = pr.id),
        'reviewDates', COALESCE((
          SELECT json_agg(review_dates."reviewDate")
          FROM (
            SELECT rt."reviewDate"
            FROM rt
            WHERE rt."projectId" = pr.id
            LIMIT 5
          ) review_dates
        ), '[]'::json)
      )
      ORDER BY pr."updatedAt" DESC, pr.id ASC
  ), '[]'::json) FROM pr) AS projects,
  (SELECT COALESCE(json_agg(st ORDER BY st."createdAt" DESC, st.id ASC), '[]'::json) FROM st) AS stickies
`;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(earlier: Date, later = new Date()) {
  return Math.max(
    0,
    Math.floor((later.getTime() - earlier.getTime()) / DAY_MS),
  );
}

function latestDate(...dates: Date[]) {
  const valid = dates.filter((date) => Number.isFinite(date.getTime()));
  if (!valid.length) return new Date();
  return new Date(Math.max(...valid.map((date) => date.getTime())));
}

function truncate(value: string, max = 100) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * 数据库里的 DateTime 列是 TIMESTAMP(3)（不带时区），Prisma 读出来按 UTC 解释。
 * 但 json_agg 返回的是不带时区后缀的字符串，JS 的 new Date() 会按本地时区解析，
 * 在东八区会整体偏 8 小时、甚至跨天。这里统一补 Z，和 Prisma 的解释保持一致。
 */
function parseDbDate(value: string): Date {
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : value + "Z");
}

async function buildAiContextUncached(
  input: AiContextInput,
): Promise<AiContext> {
  const { userId } = input;

  const raw = await prisma.$queryRawUnsafe<ContextFetchRow[]>(
    AI_CONTEXT_SQL,
    userId,
  );
  const fetched = raw[0];

  const preferences = (fetched?.preferences ?? []).map((item) => ({
    key: item.key,
    value: item.value,
    source: item.source,
  }));

  const feedbackEvents = (fetched?.feedback ?? []).map((item) => ({
    action: item.action,
    detail: item.detail,
    task: item.taskTitle ? { title: item.taskTitle } : null,
    inboxItem: item.inboxContent ? { content: item.inboxContent } : null,
  }));

  const reviews = (fetched?.reviews ?? []).map((item) => ({
    reviewDate: parseDbDate(item.reviewDate),
    summary: item.summary,
    nextActions: item.nextActions,
    decisionJson: item.decisionJson,
  }));

  const activeProjects = (fetched?.projects ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    objective: item.objective,
    currentMilestone: item.currentMilestone,
    updatedAt: parseDbDate(item.updatedAt),
    tasks: (item.tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      shortTitle: task.shortTitle,
      status: task.status,
      updatedAt: parseDbDate(task.updatedAt),
    })),
    _count: { tasks: Number(item.openTaskCount ?? 0) },
    reviewTasks: (item.reviewDates ?? []).map((value) => ({
      review: { reviewDate: parseDbDate(value) },
    })),
  }));

  const recentStickyNotes = (fetched?.stickies ?? []).map((item) => ({
    title: item.title,
    nextStep: item.nextStep,
  }));

  // 只有 task_coach / task_edit 这类带 taskId 的场景才需要单查任务，热路径不会走这里。
  const focusedTask = input.taskId
    ? await prisma.task.findUnique({
        where: { id: input.taskId, userId },
        select: {
          title: true,
          status: true,
          priority: true,
          scheduledDate: true,
          dueDate: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          inboxItem: { select: { content: true } },
          project: {
            select: {
              name: true,
              objective: true,
              currentMilestone: true,
            },
          },
        },
      })
    : null;

  const preferenceLines = preferences.map((item) => {
    const source = item.source === "manual" ? "用户设置" : "行为推断";
    return `${item.key}: ${item.value}（${source}）`;
  });
  const preferenceSummary = preferenceLines.length
    ? preferenceLines.slice(0, 8).join("；")
    : "尚未记录用户偏好";

  const projectLines: string[] = [];
  const projectEvidence: string[] = [];
  const projectFacts: ProjectPlanFact[] = [];
  for (const project of activeProjects) {
    const lastActivity = latestDate(
      project.updatedAt,
      ...project.tasks.map((task) => task.updatedAt),
      ...project.reviewTasks.map((item) => item.review.reviewDate),
    );
    const stalledDays = daysBetween(lastActivity);
    const openTasks = project._count.tasks;
    projectFacts.push({
      id: project.id,
      name: project.name,
      objective: project.objective,
      currentMilestone: project.currentMilestone,
      openTaskCount: openTasks,
      openTasks: project.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        shortTitle: task.shortTitle,
        status: task.status,
      })),
    });
    const milestone = project.currentMilestone
      ? ` / ${project.currentMilestone}`
      : "";
    const stalledText =
      stalledDays >= 3 ? `，已停 ${stalledDays} 天` : "";
    const why = project.objective
      ? `；为什么想做：${truncate(project.objective, 60)}`
      : "";
    projectLines.push(
      `${project.name}${milestone}（${openTasks} 个未完成任务${stalledText}${why}）`,
    );
    if (stalledDays >= 3) {
      projectEvidence.push(`${project.name} 已停 ${stalledDays} 天`);
    }
  }
  const projectSummary = projectLines.length
    ? projectLines.slice(0, 6).join("；")
    : "当前没有活跃项目";

  const feedbackCounts = new Map<string, number>();
  for (const event of feedbackEvents) {
    feedbackCounts.set(
      event.action,
      (feedbackCounts.get(event.action) ?? 0) + 1,
    );
  }
  const feedbackCountText = Array.from(feedbackCounts.entries())
    .slice(0, 8)
    .map(([action, count]) => `${action} ${count} 次`)
    .join("；");
  const recentFeedback = feedbackEvents.slice(0, 6).map((event) => {
    const target =
      event.task?.title ?? event.inboxItem?.content ?? "未知对象";
    return `${event.action}：${truncate(target)}`;
  });
  const feedbackSummary = feedbackCountText
    ? `${feedbackCountText}。最近：${recentFeedback.join("；")}`
    : "暂无 AI 反馈记录";

  const decisionMemory = [
    ...feedbackEvents.slice(0, 12).flatMap((event) => {
      const target =
        event.task?.title ?? event.inboxItem?.content ?? "未知对象";
      switch (event.action) {
        case "task_completed":
          return [`已完成：${truncate(target, 60)}`];
        case "task_delayed":
          return [`延期：${truncate(target, 60)}；下次降低密度或缩小范围`];
        case "task_cancelled":
          return [`取消：${truncate(target, 60)}；不要继续推荐同类高压任务`];
        case "plan_ignored":
          return [`忽略计划：${truncate(target, 60)}`];
        case "plan_edited":
          return [`修改计划：${truncate(target, 60)}；原方案不完全可执行`];
        case "suggestion_useful":
          return [
            `建议有效：${truncate(target, 60)}${
              event.detail ? `；${truncate(event.detail, 100)}` : ""
            }`,
          ];
        case "suggestion_useless":
          return [
            `建议无效：${truncate(target, 60)}${
              event.detail ? `；${truncate(event.detail, 100)}` : ""
            }`,
          ];
        default:
          return [];
      }
    }),
        // 只把便利贴标题作为“最近执行动作”的摘要，绝不再把 nextStep
    // 原样喂回模型，避免模型模仿上一条的载体（例如总是写“备忘录”）。
    ...recentStickyNotes.map(
      (note) => `最近执行动作：${truncate(note.title, 30)}`,
    ),
    ...reviews.map((review) => {
      if (review.decisionJson) {
        try {
          const decision = JSON.parse(review.decisionJson) as {
            recommendation?: string;
            nextAction?: string;
          };
          return `复盘结论：${truncate(decision.recommendation ?? review.summary, 80)}${
            decision.nextAction
              ? `；下一步：${truncate(decision.nextAction, 60)}`
              : ""
          }`;
        } catch {
          // Fall back to the review text when old data is malformed.
        }
      }
      return `复盘结论：${truncate(review.summary, 80)}`;
    }),
  ].slice(0, 10);

  const preferenceMap = new Map<string, string>();
  for (const preference of preferences) {
    if (preference.source === "manual") {
      preferenceMap.set(preference.key, preference.value);
    }
  }
  for (const preference of preferences) {
    if (preference.source === "inferred" && !preferenceMap.has(preference.key)) {
      preferenceMap.set(preference.key, preference.value);
    }
  }
  const planningGuidanceParts: string[] = [];
  let maxPlanTasks = 5;
  if (preferenceMap.get("plan_scale") === "few") {
    planningGuidanceParts.push("用户偏好少而稳，请尽量合并动作，但仍以完整交付为准");
    maxPlanTasks = 3;
  } else if (preferenceMap.get("plan_scale") === "ambitious") {
    planningGuidanceParts.push("用户接受较完整的推进，可以保留必要的独立任务");
    maxPlanTasks = 5;
  } else {
    planningGuidanceParts.push("任务数量由完整交付目标决定，不按固定 1 条或 2 条凑数");
  }
  planningGuidanceParts.push("只输出缺失任务，已有任务不要重复；续接或修正当前任务时使用 taskDisposition=attach");
  if (preferenceMap.get("default_start_action") === "research") {
    planningGuidanceParts.push("第一步优先安排调研和整理材料");
  } else if (preferenceMap.get("default_start_action") === "complete") {
    planningGuidanceParts.push("用户需要完整方案，但仍应拆成可执行步骤");
  } else {
    planningGuidanceParts.push("第一步优先安排具体动作，根据情境选择验证、反馈或直接产出");
  }
  if (preferenceMap.get("avoid_overdue") === "yes") {
    planningGuidanceParts.push("用户重视按时完成，日期安排要留余量");
  }
  const projectFocus = preferenceMap.get("project_focus");
  if (projectFocus) {
    planningGuidanceParts.push(`当前重点项目：${projectFocus}`);
  }
  if (
    feedbackCounts.get("task_delayed") ||
    feedbackCounts.get("suggestion_useless")
  ) {
    planningGuidanceParts.push("近期有延期或低质量反馈，建议降低计划密度");
    maxPlanTasks = Math.min(maxPlanTasks, 3);
  }
  planningGuidanceParts.push(`单次计划最多 ${maxPlanTasks} 条任务`);
  const planningGuidance = planningGuidanceParts.length
    ? planningGuidanceParts.join("；")
    : "根据用户目标制定适度计划";

  const reviewLines = reviews.map((review) => {
    const next = review.nextActions
      ? `，下一步：${truncate(review.nextActions, 60)}`
      : "";
    return `${formatDate(review.reviewDate)}：${truncate(review.summary, 80)}${next}`;
  });
  const reviewSummary = reviewLines.length
    ? reviewLines.join("；")
    : "暂无复盘记录";

  let taskHistorySummary = "";
  if (focusedTask) {
    const source = focusedTask.inboxItem
      ? "来自 AI 计划"
      : focusedTask.project
        ? `属于项目 ${focusedTask.project.name}`
        : "手动创建";
    const scheduled = focusedTask.scheduledDate
      ? `计划 ${formatDate(focusedTask.scheduledDate)}`
      : "";
    const due = focusedTask.dueDate
      ? `截止 ${formatDate(focusedTask.dueDate)}`
      : "";
    const completed = focusedTask.completedAt
      ? `，完成于 ${formatDate(focusedTask.completedAt)}`
      : "";
    const original = focusedTask.inboxItem
      ? `原始想法：${truncate(focusedTask.inboxItem.content, 80)}`
      : "";
    taskHistorySummary = [
      `${focusedTask.title}`,
      source,
      original,
      `状态 ${focusedTask.status}`,
      scheduled,
      due,
      completed,
    ]
      .filter(Boolean)
      .join("；");
  }

  const parts = [
    `用户偏好：${preferenceSummary}`,
    `规划提示：${planningGuidance}`,
    `活跃项目：${projectSummary}`,
    `AI 反馈：${feedbackSummary}`,
    `最近复盘：${reviewSummary}`,
  ];
  if (taskHistorySummary) parts.push(`任务历史：${taskHistorySummary}`);

  const evidence = [
    ...projectEvidence,
    ...recentFeedback.slice(0, 4),
    ...reviewLines.slice(0, 2),
  ];

  return {
    summary: parts.join("\n").slice(0, 1600),
    evidence: evidence.slice(0, 8),
    preferenceSummary,
    planningGuidance,
    maxPlanTasks,
    projectSummary,
    feedbackSummary,
    reviewSummary,
    taskHistorySummary,
    decisionMemory,
    projectFacts,
  };
}
