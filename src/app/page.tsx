import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Focus,
  ListTodo,
} from "lucide-react";
import { FirstRunTour } from "@/components/first-run-tour";
import { FIRST_RUN_TOUR_ENABLED } from "@/lib/tour";
import { Panel, PanelHeader } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { TodayTaskActions } from "@/components/today-task-actions";
import { TaskRowDisclosure } from "@/components/task-row-disclosure";
import { AiTaskPlanner } from "@/components/ai-task-planner";
import { TodayFocusControls } from "@/components/today-focus-controls";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadHomeSupport } from "@/lib/home-support";
import { buildAiContext } from "@/lib/ai-context";
import { getCurrentUser, readSessionUserId } from "@/lib/auth";
import { serializeTaskStickyNote } from "@/lib/task-sticky";
import {
  endOfDay,
  formatDate,
  isSameDay,
  startOfDay,
  toDateInputValue,
} from "@/lib/date";

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type AgendaTask = {
  id: string;
  title: string;
  shortTitle: string | null;
  notes: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  scheduledDate: Date | null;
  focusDate: Date | null;
  stickyNotes: Array<{
    id: string;
    taskId: string;
    sourceMessage: string;
    title: string;
    encouragement: string;
    stepsJson: string;
    nextStep: string;
    createdAt: Date;
  }>;
  doneWhen: string | null;
  methodHint: string | null;
  project: { name: string } | null;
  inboxItem: { id: string } | null;
  reviewNextAction: {
    review: { reviewDate: Date };
  } | null;
};

function taskSource(task: AgendaTask) {
  return task.project?.name ?? "未关联项目";
}

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  // 先只解 cookie 拿 userId（这一步不查库），让「查用户」和「查首页数据」落在同一轮往返。
  // 详见 src/lib/home-support.ts 里对跨洋链路并发劣化的说明。
  const userId = await readSessionUserId();
  if (!userId) redirect("/landing");
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  // 首页读路径保持并发：任务列表 + 新手状态 / 今日推荐 / 待整理 + 待确认的阶段门。
  const [user, support, tasks, readyStage] = await Promise.all([
    getCurrentUser(),
    loadHomeSupport({ userId, now }),
    prisma.task.findMany({
      where: { userId },
      include: {
        project: { select: { name: true } },
        inboxItem: { select: { id: true } },
        reviewNextAction: {
          select: {
            review: { select: { reviewDate: true } },
          },
        },
        stickyNotes: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.projectStage.findFirst({
      where: { userId, status: "ready" },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        deliverable: true,
        project: { select: { name: true } },
      },
    }),
  ]);
  if (!user) redirect("/landing");
  const { firstRun, focusSuggestions, pendingInbox } = support;


  const openTasks = tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );

  const agenda = [...openTasks].sort((a, b) => {
    function rank(task: AgendaTask) {
      if (task.focusDate && isSameDay(task.focusDate, now)) return 0;
      if (task.dueDate && task.dueDate < dayStart) return 1;
      if (
        task.scheduledDate &&
        task.scheduledDate >= dayStart &&
        task.scheduledDate <= dayEnd
      ) {
        return 2;
      }
      return 3;
    }

    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return (
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
    );
  });

  const todayRelevant = agenda.filter((task) => {
    if (task.focusDate && isSameDay(task.focusDate, now)) return true;
    if (task.dueDate && task.dueDate < dayStart) return true;
    if (
      task.scheduledDate &&
      task.scheduledDate >= dayStart &&
      task.scheduledDate <= dayEnd
    ) {
      return true;
    }
    return false;
  });

  // 今天完成的也留在「今日建议」里：按 completedAt 落在今天判断，
  // 过了 0 点自然就不在今天，等于每天自动清空。
  const completedTodayTasks = tasks
    .filter(
      (task) =>
        task.status === "done" &&
        task.completedAt &&
        task.completedAt >= dayStart &&
        task.completedAt <= dayEnd,
    )
    .sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    )
    .slice(0, 5);

  // 「今日建议」的待办部分交给模型取舍：当天已有推荐时按推荐取，
  // 规则只在没有推荐时兜底、以及推荐名额因完成/取消空出来时补位。
  const ruleOrdered = todayRelevant.length ? todayRelevant : agenda;
  const openById = new Map(openTasks.map((task) => [task.id, task]));
  const recommendedOpen = (focusSuggestions ?? [])
    .map((item) => openById.get(item.taskId))
    .filter((task): task is (typeof openTasks)[number] => Boolean(task));

  const recommendedIds = new Set(recommendedOpen.map((task) => task.id));
  const backfill = ruleOrdered.filter((task) => !recommendedIds.has(task.id));
  const focusTarget = focusSuggestions
    ? Math.min(3, focusSuggestions.length)
    : 3;
  const plannedTasks = [...recommendedOpen, ...backfill].slice(0, focusTarget);

  const reasonByTaskId = new Map(
    (focusSuggestions ?? []).map((item) => [item.taskId, item.reason]),
  );
  // 用户读页面 / 打字的时间足够把 AI 上下文查好：放到响应之后预热，提交时直接命中缓存，
  // 省掉第一次 5~6 秒的跨洋查询（见 AGENTS.md「性能优化」一节）。
  after(() =>
    buildAiContext({ kind: "inbox_plan", userId: user.id }).catch(() => {}),
  );

  const dateKey = toDateInputValue(now);

  const todayTasks = [...plannedTasks, ...completedTodayTasks];

  return (
    <>
      {FIRST_RUN_TOUR_ENABLED ? (
        <FirstRunTour
          initialStep={firstRun.tourStep}
          context="home"
          hasTasks={tasks.length > 0}
          enabled={firstRun.isFirstRun}
        />
      ) : null}

      <Panel>
        <AiTaskPlanner pending={pendingInbox} />
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="今日建议"
          icon={ListTodo}
          action={
            <TodayFocusControls
              count={plannedTasks.length}
              hasFocus={Boolean(focusSuggestions?.length)}
              dateKey={dateKey}
            />
          }
        />
        {todayTasks.length ? (
          <div className="divide-y divide-border">
            {plannedTasks.map((task) => (
              <AgendaTaskRow
                key={task.id}
                task={task}
                now={now}
                dayStart={dayStart}
                reason={reasonByTaskId.get(task.id) ?? null}
              />
            ))}
            {completedTodayTasks.length ? (
              <div className="flex items-center gap-1.5 bg-surface-muted/60 px-4 py-2 text-xs font-medium text-ink-muted">
                <CheckCircle2 className="size-3.5" />
                今天完成 {completedTodayTasks.length}
              </div>
            ) : null}
            {completedTodayTasks.map((task) => (
              <AgendaTaskRow
                key={task.id}
                task={task}
                now={now}
                dayStart={dayStart}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Focus}
            title="今天还没有重点"
          />
        )}
      </Panel>

      {readyStage ? (
        <Panel className="mt-6">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                「{readyStage.project.name}」这一阶段完成了
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                {readyStage.deliverable}
              </p>
            </div>
            <Link
              href="/files"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
            >
              下一阶段
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Panel>
      ) : null}
    </>
  );
}


function AgendaTaskRow({
  task,
  now,
  dayStart,
  reason,
}: {
  task: AgendaTask;
  now: Date;
  dayStart: Date;
  reason?: string | null;
}) {
  const isFocused = task.focusDate && isSameDay(task.focusDate, now);
  const isOverdue = task.dueDate && task.dueDate < dayStart;
  const isScheduled =
    task.scheduledDate &&
    task.scheduledDate >= dayStart &&
    task.scheduledDate <= endOfDay(now);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <TaskRowDisclosure
          taskId={task.id}
          title={task.title}
          shortTitle={task.shortTitle}
          notes={task.notes}
          projectName={task.project?.name ?? null}
          status={task.status}
          initialNotes={task.stickyNotes.map(serializeTaskStickyNote)}
        >
          <span className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            {isFocused ? (
              <span className="inline-flex h-5 items-center gap-1 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent-strong">
                <Focus className="size-3" />
                重点
              </span>
            ) : null}
            {isOverdue ? (
              <span className="inline-flex h-5 items-center gap-1 rounded bg-danger/10 px-1.5 text-[11px] font-medium text-danger">
                <Clock3 className="size-3" />
                逾期
              </span>
            ) : null}
            {isScheduled ? (
              <span className="inline-flex h-5 items-center gap-1 rounded bg-surface-muted px-1.5 text-[11px] font-medium text-ink-secondary">
                <ListTodo className="size-3" />
                计划
              </span>
            ) : null}
            <span className="truncate text-xs text-ink-secondary">
              {taskSource(task)}
            </span>
            {reason ? (
              <span className="text-xs leading-5 text-ai">{reason}</span>
            ) : null}
            {task.dueDate ? (
              <span className="text-xs text-danger">建议 {formatDate(task.dueDate)}前完成</span>
            ) : null}
          </span>
        </TaskRowDisclosure>
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:ml-auto lg:w-auto">
        <StatusBadge status={task.priority} />
        <TodayTaskActions taskId={task.id} status={task.status} />
      </div>
    </div>
  );
}
