import { redirect } from "next/navigation";
import {
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
import { CheckinTodayPanel } from "@/components/checkin-today-panel";
import { after } from "next/server";
import { buildAiContext } from "@/lib/ai-context";
import { getCurrentUser, readSessionUserId } from "@/lib/auth";
import { buildTodayView, type TodayViewTask } from "@/lib/today-view";
import { formatDate, toDateInputValue } from "@/lib/date";


function taskSource(task: TodayViewTask) {
  return task.projectName ?? "未关联项目";
}

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  // 先只解 cookie 拿 userId（这一步不查库），让「查用户」和「查首页数据」落在同一轮往返。
  // 详见 src/lib/home-support.ts 里对跨洋链路并发劣化的说明。
  const userId = await readSessionUserId();
  if (!userId) redirect("/landing");
  const now = new Date();
  // 首页数据走两端共用的今日视图契约，小程序消费同一份。
  const [user, view] = await Promise.all([
    getCurrentUser(),
    buildTodayView({ userId, now }),
  ]);
  if (!user) redirect("/landing");
  const {
    firstRun,
    focusSuggestions,
    pendingInbox,
    plannedTasks,
    completedTodayTasks,
    checkin,
  } = view;
  const dateKey = toDateInputValue(now);
  const todayTasks = [...plannedTasks, ...completedTodayTasks];

  // 用户读页面 / 打字的时间足够把 AI 上下文查好：放到响应之后预热，提交时直接命中缓存，
  // 省掉第一次 5~6 秒的跨洋查询（见 AGENTS.md「性能优化」一节）。
  after(() =>
    buildAiContext({ kind: "inbox_plan", userId: user.id }).catch(() => {}),
  );

  return (
    <>
      {FIRST_RUN_TOUR_ENABLED ? (
        <FirstRunTour
          initialStep={firstRun.tourStep}
          context="home"
          hasTasks={todayTasks.length > 0}
          enabled={firstRun.isFirstRun}
        />
      ) : null}

      <Panel>
        <AiTaskPlanner pending={pendingInbox} />
      </Panel>

      {checkin ? <CheckinTodayPanel checkin={checkin} /> : null}

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
              <AgendaTaskRow key={task.id} task={task} />
            ))}
            {completedTodayTasks.length ? (
              <div className="flex items-center gap-1.5 bg-surface-muted/60 px-4 py-2 text-xs font-medium text-ink-muted">
                <CheckCircle2 className="size-3.5" />
                今天完成 {completedTodayTasks.length}
              </div>
            ) : null}
            {completedTodayTasks.map((task) => (
              <AgendaTaskRow key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Focus}
            title="今天还没有重点"
          />
        )}
      </Panel>

    </>
  );
}


function AgendaTaskRow({ task }: { task: TodayViewTask }) {
  const isFocused = task.isFocused;
  const isOverdue = task.isOverdue;
  const isScheduled = task.isScheduled;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <TaskRowDisclosure
          taskId={task.id}
          title={task.title}
          shortTitle={task.shortTitle}
          notes={task.notes}
          projectName={task.projectName}
          status={task.status}
          initialNotes={task.stickyNotes}
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
            {task.reason ? (
              <span className="text-xs leading-5 text-ai">{task.reason}</span>
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
