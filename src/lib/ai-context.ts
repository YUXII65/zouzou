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

export async function buildAiContext(
  input: AiContextInput,
): Promise<AiContext> {
  const { userId } = input;
  const [
    preferences,
    feedbackEvents,
    reviews,
    activeProjects,
    focusedTask,
    recentStickyNotes,
  ] = await Promise.all([
      prisma.userPreference.findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 20,
      }),
      prisma.aiFeedbackEvent.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 50,
        include: {
          task: { select: { title: true } },
          inboxItem: { select: { content: true } },
        },
      }),
      prisma.review.findMany({
        where: { userId },
        orderBy: [{ reviewDate: "desc" }, { id: "asc" }],
        take: 3,
        select: {
          reviewDate: true,
          summary: true,
          nextActions: true,
          decisionJson: true,
        },
      }),
      prisma.project.findMany({
        where: { status: "active", userId },
        select: {
          id: true,
          name: true,
          objective: true,
          currentMilestone: true,
          updatedAt: true,
          tasks: {
            where: { status: { in: ["todo", "in_progress"] } },
            select: {
              id: true,
              title: true,
              shortTitle: true,
              updatedAt: true,
              status: true,
            },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            take: 5,
          },
          _count: {
            select: {
              tasks: {
                where: { status: { in: ["todo", "in_progress"] } },
              },
            },
          },
          reviewTasks: {
            select: {
              review: { select: { reviewDate: true } },
            },
            take: 5,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 8,
      }),
      input.taskId
        ? prisma.task.findUnique({
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
        : null,
      prisma.taskStickyNote.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 6,
        select: {
          title: true,
          nextStep: true,
          createdAt: true,
        },
      }),
    ]);

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
    ...recentStickyNotes.map(
      (note) =>
        `最近执行动作：${truncate(note.title, 30)} → ${truncate(note.nextStep, 60)}`,
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
