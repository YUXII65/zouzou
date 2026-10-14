import { withAiQuota } from "@/lib/ai-quota";
import { callModel, safePlanTask, type InboxPlanTask } from "@/lib/ai";
import { startOfDay, toDateInputValue } from "@/lib/date";
import { extractJsonObject } from "@/lib/json-extract";
import { buildTaskContract } from "@/lib/task-contract";
import { MAX_AI_TASKS_PER_PLAN } from "@/lib/task-flow";
import { invalidateAiContext } from "@/lib/ai-context";
import { prisma, withTransactionRetry } from "@/lib/prisma";
import type { ExploreContinuation, StagePreview } from "@/lib/project-progress-types";
import {
  MAX_EXPLORE_OPEN_TASKS,
  MAX_EXPLORE_TRACKS,
  normalizeTrackRole,
} from "@/lib/project-track";

const LONGTERM_STAGE_SYSTEM_PROMPT = `
你是走走里的“长期项目阶段衔接 Agent”。
你要让用户在一个长期项目里随时看清两件事：当前阶段在把什么做成什么、下一阶段会推进成什么样。你只做这两件事的总结和下一阶段的衔接，不写复盘，不评价用户。

只返回 JSON，不要 Markdown。
输出格式：
{
  "currentSummary": "当前阶段一句话总结，20 字以内，说清这一步在把什么做成什么",
  "nextSummary": "下一阶段一句话总结，20 字以内，说清接下来会把什么推进成什么样",
  "nextMilestone": "下一阶段要交付什么，必须具体可检查",
  "reason": "为什么现在进入这一阶段",
  "tasks": [
    {
      "title": "第一条要做的具体动作",
      "shortTitle": "4-12字的语义标题",
      "notes": "这条任务的补充说明或依赖",
      "executionMode": "quick|tool|produce|explore|project",
      "doneWhen": "什么结果算完成",
      "methodHint": "具体怎么做、用什么、做到什么判断点",
      "recommendation": "已经替用户做出的默认决定",
      "executionSteps": ["具体执行动作"],
      "fallback": "主路径失效时的替代做法",
      "maxTurns": 1,
      "toolPolicy": "none|read|confirm-write",
      "priority": "low|medium|high|urgent",
      "scheduledDate": null,
      "dueDate": null
    }
  ]
}

硬规则：
- currentSummary / nextSummary 是概括，不是截断：不要照抄 deliverable 或项目目标原文，也不能写成“继续推进”“按计划进行”这类空话。
- currentSummary 说当前阶段正在做什么、做成什么样；nextSummary 说紧接着的这一步会把什么推进成什么样。
- 输入里 stageState 为 "active" 表示当前阶段还没做完：下一阶段只能按已有信息推断，写清要做什么就行，不要编造还没发生的结果。
- 只规划下一阶段，不规划未来两个阶段。
- 下一阶段必须由当前阶段已完成或正在推进的结果自然接上。
- tasks 只保留当前阶段真正需要的 1-3 条，不设固定数量，不要把连续动作拆碎。
- 第一条任务必须今天或明天就能开始。
- tasks 里不写复盘、总结、检查、打卡、日报、周报、备忘录。
- 不写“按计划推进”“先想清楚”“做好准备”“根据情况调整”这类空话。
- 如果已经延期，优先缩小范围、合并步骤，不要把原计划原样加回来。
`.trim();

const EXPLORE_AGENT_SYSTEM_PROMPT = `
你是走走里的“探索推进 Agent”。
探索项目没有终点，也不一定只有一条路：它可能同时有几条线路在发展，有主次。主线是这个阶段真正投入的方向，支线是保持接触、低成本验证的方向。你只负责根据最新一次任务事件，决定下一步推进哪条线、做什么。你不是复盘员，不要写总结，不要评价用户，不要按日期或固定节奏生成任务。

只返回 JSON，不要 Markdown。
输出格式：
{
  "decision": "continue|adjust|switch|pause",
  "trackName": "这次推进哪条线：优先沿用输入 tracks 里的已有 name；只有真的出现新的方向才起一个新 name",
  "trackRole": "main|side：这次推进后这条线的角色",
  "newTrackIntent": "只有 trackName 是新方向时填：这条线在发展 / 验证什么；否则 null",
  "currentMilestone": "现在探索到哪 / 当前主线在练什么或验证什么",
  "reason": "为什么现在给这个下一步，必须引用当前任务或最近完成情况",
  "task": {
    "title": "下一条具体任务",
    "shortTitle": "4-12字的语义标题",
    "notes": "为什么做这条任务，或依赖什么",
    "executionMode": "quick|tool|produce|explore|project",
    "doneWhen": "什么结果算完成",
    "methodHint": "具体怎么做、用什么、做到什么判断点",
    "recommendation": "已经替用户做出的默认决定",
    "executionSteps": ["具体执行动作"],
    "fallback": "主路径失效时的替代做法",
    "maxTurns": 1,
    "toolPolicy": "none|read|confirm-write",
    "priority": "low|medium|high|urgent",
    "scheduledDate": null,
    "dueDate": null
  }
}

硬规则：
- 任务事件是唯一触发源：完成、卡住、取消、编辑、补充结果。不要按星期几、间隔天数或 cadence 决定什么时候推进。
- 每条线同时只保留一条开放任务：事件任务所属的线如果已经有开放任务，就返回 task:null，不要重复堆任务。项目里其他线还有开放任务，不影响这条线继续推进。
- 只生成 1 条任务，最多 1 条；没有足够信息时 task 可以为 null。
- trackName 默认沿着事件任务所属的线继续；只有出现明确的新方向才换线或开新线，换线时 decision 用 "switch"。
- 主线只有一条：如果某条支线最近连续拿到有效反馈、或者主线连续卡住，可以把这条支线提为 main、原主线降为 side，用 trackRole 表达调整后的角色。
- 一条线连续被取消或忽略时，用 decision:"pause"，不要继续催。
- 完成得明确、有结果：继续下一步或适度提高难度。
- 完成但不知道结果：沿原方向给一个很小的下一步，不要假装能力已经提升。
- 卡住：优先换方法、拆小动作，不重复原任务。
- 取消：判断是方向不对还是做法不对，下一轮不要原样再推。
- 不设截止日期，不提“项目完成”，不写完成度百分比。
- 不重复已完成、已取消或当前开放中的任务。
`.trim();

function asString(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** AI 没给 summary 时的兜底：取第一句话，超长再截断，不硬切整段。 */
function summarizeLine(text: string | null | undefined, limit = 20) {
  const source = (text ?? "").trim();
  if (!source) return "";
  const first =
    source.split(/[，,。；;：:！？!?\n]/).find((part) => part.trim())?.trim() ??
    source;
  return first.length > limit ? first.slice(0, limit) + "…" : first;
}

function parseJsonObject(text: string | null) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(extractJsonObject(text) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function shortTitleFromTitle(title: string) {
  const first = title.split(/[，,。；;！？!?\n]/)[0]?.trim() || title.trim();
  return first.length > 12 ? first.slice(0, 12).trim() : first;
}

function normalizeTask(raw: unknown, fallbackTitle: string): InboxPlanTask | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const task = safePlanTask({
    ...value,
    title: asString(value.title, 200) || fallbackTitle,
    shortTitle:
      asString(value.shortTitle, 40) ||
      shortTitleFromTitle(asString(value.title, 200) || fallbackTitle),
  });
  if (!task.title || task.title === "待整理任务") return null;
  return task;
}

function normalizeTasks(raw: unknown, fallbackTitle: string, limit: number) {
  return (Array.isArray(raw) ? raw : [])
    .map((item, index) =>
      normalizeTask(
        item,
        index === 0 ? fallbackTitle : `继续推进：${fallbackTitle}`,
      ),
    )
    .filter((item): item is InboxPlanTask => Boolean(item))
    .slice(0, limit);
}

export async function generateLongtermStagePreview(input: {
  userId: string;
  stageId: string;
}): Promise<StagePreview | null> {
  const stage = await prisma.projectStage.findFirst({
    // active 阶段也要能生成：用户要在当前阶段就看到下一阶段的总结版。
    where: {
      id: input.stageId,
      userId: input.userId,
      status: { in: ["active", "ready"] },
    },
    select: {
      id: true,
      status: true,
      deliverable: true,
      doneWhen: true,
      project: {
        select: { id: true, name: true, objective: true, currentMilestone: true },
      },
      tasks: {
        orderBy: [{ planOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          title: true,
          notes: true,
          status: true,
          doneWhen: true,
          methodHint: true,
          completedAt: true,
          dueDate: true,
        },
      },
    },
  });
  if (!stage) return null;

  const completedTasks = stage.tasks.filter((task) => task.status === "done");
  const openTasks = stage.tasks.filter(
    (task) => task.status === "todo" || task.status === "in_progress",
  );

  const payload = {
    today: toDateInputValue(startOfDay()),
    // active：当前阶段还没做完，下一阶段只能按已有信息推断
    stageState: stage.status,
    project: stage.project,
    currentStage: {
      deliverable: stage.deliverable,
      doneWhen: stage.doneWhen,
      totalTaskCount: stage.tasks.length,
      completedTaskCount: completedTasks.length,
      completedTasks: completedTasks.map((task) => ({
        title: task.title,
        notes: task.notes,
        doneWhen: task.doneWhen,
        methodHint: task.methodHint,
        completedAt: task.completedAt?.toISOString() ?? null,
        dueDate: task.dueDate ? toDateInputValue(task.dueDate) : null,
      })),
      openTasks: openTasks.map((task) => ({
        title: task.title,
        notes: task.notes,
        doneWhen: task.doneWhen,
      })),
    },
  };

  const text = await withAiQuota(
    "stage_preview",
    () =>
      callModel(
        LONGTERM_STAGE_SYSTEM_PROMPT,
        JSON.stringify(payload),
        undefined,
        undefined,
        undefined,
        0.35,
        {
          maxTokens: 1800,
          timeoutMs: 20_000,
          totalBudgetMs: 26_000,
          maxAttempts: 2,
          reasoningEffort: "none",
        },
      ),
    input.userId,
  );

  const parsed = parseJsonObject(text);
  const tasks = normalizeTasks(
    parsed?.tasks,
    `推进「${stage.project.name}」的下一阶段`,
    MAX_AI_TASKS_PER_PLAN,
  );
  const nextMilestone =
    asString(parsed?.nextMilestone, 300) ||
    `完成「${stage.project.name}」的下一阶段可交付结果`;
  const preview: StagePreview = {
    currentSummary:
      asString(parsed?.currentSummary, 60) || summarizeLine(stage.deliverable),
    nextSummary: asString(parsed?.nextSummary, 60) || summarizeLine(nextMilestone),
    nextMilestone,
    reason:
      asString(parsed?.reason, 500) ||
      `当前阶段「${stage.deliverable}」已经完成，下一步进入新的可交付阶段。`,
    tasks: tasks.length
      ? tasks
      : [
          safePlanTask({
            title: `推进「${stage.project.name}」的下一阶段`,
            shortTitle: "推进下一阶段",
            executionMode: "produce",
            doneWhen: "下一阶段出现一个可检查、可继续推进的具体结果",
            methodHint: "从当前阶段已经完成的结果出发，先完成下一阶段的第一项可交付内容",
            recommendation: "不再重复当前阶段，直接进入下一阶段的第一项交付",
            executionSteps: ["查看当前阶段完成结果", "完成下一阶段第一项可交付内容"],
            fallback: "如果当前结果不足以进入下一阶段，先补齐一个最小依赖再继续",
            maxTurns: 2,
            toolPolicy: "none",
            priority: "medium",
            scheduledDate: toDateInputValue(startOfDay()),
            dueDate: null,
          }),
        ],
    source: text ? "model" : "fallback",
  };

  await prisma.projectStage.update({
    where: { id: stage.id, userId: input.userId },
    data: {
      nextStageJson: JSON.stringify(preview),
      nextStageUpdatedAt: new Date(),
    },
  });

  return preview;
}

export async function advanceExploreAfterTask(input: {
  userId: string;
  taskId: string;
}): Promise<string | null> {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId: input.userId },
    select: {
      id: true,
      title: true,
      notes: true,
      status: true,
      completedAt: true,
      projectId: true,
      trackId: true,
      track: { select: { id: true, name: true, role: true } },
      project: {
        select: { id: true, name: true, objective: true, currentMilestone: true },
      },
      stickyNotes: { orderBy: { createdAt: "desc" }, take: 2 },
    },
  });
  if (!task?.project) return null;

  const project = await prisma.project.findFirst({
    where: { id: task.project.id, userId: input.userId },
    select: { mode: true },
  });
  if (project?.mode !== "explore") return null;

  const openTasks = await prisma.task.findMany({
    where: {
      userId: input.userId,
      projectId: task.project.id,
      status: { in: ["todo", "in_progress"] },
    },
    select: { id: true, title: true, trackId: true },
  });
  // 每条线同时只保留一条开放任务：这条线已经有下一步，就不重复生成。
  // 项目里其他线还有开放任务，不影响这条线继续推进。
  // 旧数据（没有 trackId）沿用老规则——整个项目清空才续接。
  if (openTasks.length > 0) {
    if (!task.trackId) return null;
    if (openTasks.some((item) => item.trackId === task.trackId)) return null;
    if (openTasks.length >= MAX_EXPLORE_OPEN_TASKS) return null;
  }

  const tracks = await prisma.projectTrack.findMany({
    where: { userId: input.userId, projectId: task.project.id },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      order: true,
      name: true,
      intent: true,
      role: true,
      status: true,
      currentFocus: true,
    },
  });
  const activeTracks = tracks.filter((track) => track.status !== "archived");

  const recent = await prisma.task.findMany({
    where: {
      userId: input.userId,
      projectId: task.project.id,
      status: { in: ["done", "cancelled"] },
    },
    orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
    take: 8,
    select: {
      title: true,
      notes: true,
      status: true,
      doneWhen: true,
      methodHint: true,
      completedAt: true,
      stickyNotes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const payload = {
    today: toDateInputValue(startOfDay()),
    project: task.project,
    eventTask: {
      title: task.title,
      notes: task.notes,
      status: task.status,
      completedAt: task.completedAt?.toISOString() ?? null,
      trackName: task.track?.name ?? null,
      lastStickyNextStep: task.stickyNotes[0]?.nextStep ?? null,
    },
    tracks: activeTracks.map((track) => ({
      name: track.name,
      intent: track.intent,
      role: track.role,
      status: track.status,
      currentFocus: track.currentFocus,
      openTaskCount: openTasks.filter((item) => item.trackId === track.id).length,
    })),
    recent: recent.map((item) => ({
      title: item.title,
      notes: item.notes,
      status: item.status,
      doneWhen: item.doneWhen,
      methodHint: item.methodHint,
      completedAt: item.completedAt?.toISOString() ?? null,
      nextStep: item.stickyNotes[0]?.nextStep ?? null,
    })),
  };

  const text = await withAiQuota(
    "explore_advance",
    () =>
      callModel(
        EXPLORE_AGENT_SYSTEM_PROMPT,
        JSON.stringify(payload),
        undefined,
        undefined,
        undefined,
        0.45,
        {
          maxTokens: 1400,
          timeoutMs: 20_000,
          totalBudgetMs: 26_000,
          maxAttempts: 2,
          reasoningEffort: "none",
        },
      ),
    input.userId,
  );

  const parsed = parseJsonObject(text);
  const decision = asString(parsed?.decision, 20);
  const normalizedDecision: ExploreContinuation["decision"] =
    decision === "adjust" ||
    decision === "switch" ||
    decision === "pause" ||
    decision === "continue"
      ? decision
      : "continue";
  const nextTask =
    normalizedDecision === "pause"
      ? null
      : normalizeTask(parsed?.task, `继续「${task.project.name}」的下一步`);
  // 这次推进哪条线：优先用模型给的名字，其次沿用事件任务所属的线，最后回主线。
  const trackName =
    asString(parsed?.trackName, 40) ||
    task.track?.name ||
    activeTracks.find((track) => track.role === "main")?.name ||
    null;
  const continuation: ExploreContinuation = {
    decision: normalizedDecision,
    trackName,
    trackRole: normalizeTrackRole(parsed?.trackRole ?? task.track?.role),
    newTrackIntent: asString(parsed?.newTrackIntent, 200) || null,
    currentMilestone:
      asString(parsed?.currentMilestone, 300) ||
      task.project.currentMilestone ||
      `继续探索「${task.project.name}」`,
    reason:
      asString(parsed?.reason, 500) ||
      `上一轮任务「${task.title}」已经结束，需要根据这次结果继续推进探索。`,
    task:
      nextTask ??
      (normalizedDecision === "pause"
        ? null
        : safePlanTask({
            title: `继续「${task.project.name}」的下一步`,
            shortTitle: "继续下一步",
            executionMode: "explore",
            doneWhen: "拿到一条能改变下一步判断的新反馈",
            methodHint: "沿用最近一次有效做法，只改变一个变量，观察结果变化",
            recommendation: "不要重新规划整个方向，先做一个小变化再观察结果",
            executionSteps: ["沿用最近一次做法", "只改变一个变量并记录结果"],
            fallback: "如果还是没有反馈，换一个更小的动作或换一种入口",
            maxTurns: 3,
            toolPolicy: "none",
            priority: "medium",
            scheduledDate: null,
            dueDate: null,
          })),
    source: text ? "model" : "fallback",
  };

  if (!continuation.task) {
    // 暂停这条线：标成暂缓，避免下一轮原样再推。
    if (normalizedDecision === "pause" && task.trackId) {
      await prisma.projectTrack.updateMany({
        where: { id: task.trackId, userId: input.userId },
        data: { status: "paused", lastEventAt: new Date() },
      });
    }
    return null;
  }

  const createdTaskId = await withTransactionRetry(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${task.project!.id} FOR UPDATE`;
    const openNow = await tx.task.findMany({
      where: {
        userId: input.userId,
        projectId: task.project!.id,
        status: { in: ["todo", "in_progress"] },
      },
      select: { id: true, trackId: true },
    });
    // 旧数据没有线路归属，沿用老规则：项目清空才续接。
    if (!task.trackId && openNow.length > 0) return null;

    // 定位这次推进的线路：已有就复用，真是新方向才建线，超出上限回落到主线。
    let targetTrackId: string | null = task.trackId ?? null;
    if (continuation.trackName) {
      const existing = tracks.find(
        (track) => track.name === continuation.trackName,
      );
      if (existing) {
        targetTrackId = existing.id;
      } else if (activeTracks.length < MAX_EXPLORE_TRACKS) {
        const nextOrder =
          tracks.reduce((max, track) => Math.max(max, track.order), -1) + 1;
        const createdTrack = await tx.projectTrack.create({
          data: {
            userId: input.userId,
            projectId: task.project!.id,
            order: nextOrder,
            name: continuation.trackName,
            intent: continuation.newTrackIntent || continuation.reason,
            role: continuation.trackRole,
            status: "active",
            currentFocus: continuation.currentMilestone,
            lastEventAt: new Date(),
          },
          select: { id: true },
        });
        targetTrackId = createdTrack.id;
      } else {
        targetTrackId =
          activeTracks.find((track) => track.role === "main")?.id ??
          targetTrackId;
      }
    }

    // 老的探索项目还没有线路：用项目名补一条主线，让后续推进有归属。
    if (!targetTrackId && tracks.length === 0) {
      const bootstrapped = await tx.projectTrack.create({
        data: {
          userId: input.userId,
          projectId: task.project!.id,
          order: 0,
          name: task.project!.name.slice(0, 30),
          intent:
            task.project!.objective.slice(0, 200) || task.project!.name,
          role: "main",
          status: "active",
          currentFocus: continuation.currentMilestone,
          lastEventAt: new Date(),
        },
        select: { id: true },
      });
      targetTrackId = bootstrapped.id;
    }

    // 每条线同时只留一条开放任务；项目开放任务到上限也不再堆。
    if (targetTrackId && openNow.some((item) => item.trackId === targetTrackId)) {
      return null;
    }
    if (openNow.length >= MAX_EXPLORE_OPEN_TASKS) return null;

    const contract = buildTaskContract(
      `${continuation.task!.title} ${continuation.task!.notes ?? ""}`,
      continuation.task!.title,
    );
    const created = await tx.task.create({
      data: {
        userId: input.userId,
        title: continuation.task!.title,
        shortTitle: continuation.task!.shortTitle,
        notes: continuation.task!.notes,
        projectId: task.project!.id,
        trackId: targetTrackId,
        status: "todo",
        priority: continuation.task!.priority,
        scheduledDate: continuation.task!.scheduledDate
          ? new Date(`${continuation.task!.scheduledDate}T00:00:00`)
          : null,
        dueDate: null,
        executionMode: continuation.task!.executionMode || contract.executionMode,
        doneWhen: continuation.task!.doneWhen || contract.doneWhen,
        methodHint: continuation.task!.methodHint || contract.methodHint,
        maxTurns: continuation.task!.maxTurns || contract.maxTurns,
        toolPolicy: continuation.task!.toolPolicy || contract.toolPolicy,
        planOrder: 0,
      },
      select: { id: true },
    });

    await tx.taskStickyNote.create({
      data: {
        userId: input.userId,
        taskId: created.id,
        sourceMessage: "探索推进 Agent",
        title: continuation.task!.shortTitle,
        encouragement: continuation.reason,
        stepsJson: JSON.stringify(
          continuation.task!.executionSteps.length
            ? continuation.task!.executionSteps
            : [continuation.task!.recommendation || continuation.task!.doneWhen],
        ),
        nextStep:
          continuation.task!.recommendation ||
          continuation.task!.executionSteps[0] ||
          continuation.task!.doneWhen,
      },
    });

    await tx.project.update({
      where: { id: task.project!.id, userId: input.userId },
      data: { currentMilestone: continuation.currentMilestone },
    });

    // 线路推进：刷新焦点，并按模型判断调整主次（主线保持唯一）。
    if (targetTrackId) {
      if (continuation.trackRole === "main") {
        await tx.projectTrack.updateMany({
          where: {
            userId: input.userId,
            projectId: task.project!.id,
            id: { not: targetTrackId },
            role: "main",
          },
          data: { role: "side" },
        });
      }
      await tx.projectTrack.update({
        where: { id: targetTrackId },
        data: {
          role: continuation.trackRole,
          status: "active",
          currentFocus: continuation.currentMilestone,
          lastEventAt: new Date(),
        },
      });
    }

    return created.id;
  });

  if (createdTaskId) invalidateAiContext(input.userId);
  return createdTaskId;
}
