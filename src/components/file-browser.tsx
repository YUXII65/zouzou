"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/date";
import type { ProjectStatus } from "@prisma/client";
import { ChevronDown, Folder, FolderOpen, History, ListTodo } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { TaskRow } from "@/components/task-row";
import { ReviewDraftGenerator } from "@/components/review-draft-generator";
import {
  PROJECT_MODES,
  PROJECT_MODE_META,
  normalizeProjectMode,
  type ProjectMode,
} from "@/lib/work-mode";
import type { TaskStickyNoteData } from "@/lib/task-sticky";
import { isOpenTaskStatus } from "@/lib/task-flow";
import { isInsideFloatingLayer } from "@/lib/use-click-outside";
import { REVIEW_ENABLED } from "@/lib/review-feature";
import { StagePreviewPanel } from "@/components/stage-preview-panel";
import type { StagePreview } from "@/lib/project-progress-types";
import { cx } from "@/lib/utils";

export type FileTaskData = {
  id: string;
  title: string;
  shortTitle?: string | null;
  notes: string | null;
  status: string;
  priority: string;
  scheduledDate: Date | null;
  dueDate: Date | null;
  focusDate?: Date | null;
  executionMode?: string | null;
  doneWhen?: string | null;
  completedAt?: Date | null;
  stickyNotes?: TaskStickyNoteData[];
};

/** 探索线路：一条线是一个发展方向，主线只有一条。 */
export type FileTrackData = {
  id: string;
  name: string;
  intent: string;
  role: string;
  status: string;
  currentFocus: string | null;
};

export type FileProjectData = {
  id: string;
  name: string;
  mode: string;
  /** 用于「按时间」排列 */
  updatedAt: Date | string;
  status: ProjectStatus;
  currentMilestone: string | null;
  /** 探索模式的节奏（由 AI 判断） */
  cadence?: string | null;
  /** 探索线路图：主线在前，支线在后 */
  tracks?: FileTrackData[];
  /** 长期项目的当前阶段；只暴露 active / ready，避免把未来阶段提前铺开 */
  stage?: {
    id: string;
    order: number;
    status: string;
    deliverable: string;
    doneWhen: string | null;
    nextStage: StagePreview | null;
  } | null;
  /** 项目复盘日期，供展开区直接点开回看 */
  reviews?: Array<{ id: string; reviewDate: Date | string }>;
  notes: string | null;
  tasks: FileTaskData[];
};

export const UNASSIGNED_ID = "__unassigned__";

function sortCompleted(tasks: FileTaskData[]) {
  return [...tasks].sort(
    (a, b) =>
      (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
  );
}

/**
 * 文件页：一列文件夹。
 * v3.5 起点文件夹是**就地弹开**——文件夹自己展开、内容跟在它下面，
 * 不再在右边另开一个同名面板；也不再提供新建 / 编辑文件夹和手动加任务的入口。
 */
export function FileBrowser({
  projects,
  unassociatedTasks,
  initialProjectId,
  today,
  showLabels = false,
  editingPanel = null,
  reviewPanel = null,
}: {
  projects: FileProjectData[];
  unassociatedTasks: FileTaskData[];
  initialProjectId: string | null;
  /** 服务端算好的今天（YYYY-MM-DD），避免客户端时区差异 */
  today: string;
  showLabels?: boolean;
  /** 从 ?edit= 进来时的任务编辑面板 */
  editingPanel?: React.ReactNode;
  /** 从 ?review= 进来时的复盘面板 */
  reviewPanel?: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(initialProjectId);
  const [taskView, setTaskView] = useState<"open" | "done">("open");
  const [listMode, setListMode] = useState<"type" | "time">("type");

  const byTime = [...projects].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const grouped = PROJECT_MODES.map((mode) => ({
    mode,
    projects: projects.filter(
      (project) => normalizeProjectMode(project.mode) === mode,
    ),
  })).filter((group) => group.projects.length > 0);

  function toggleFolder(id: string) {
    setOpenId((current) => (current === id ? null : id));
    setTaskView("open");
    window.history.replaceState(
      null,
      "",
      id === UNASSIGNED_ID ? "/files?view=unassigned" : "/files?project=" + id,
    );
  }

  const hasAnything = projects.length > 0 || unassociatedTasks.length > 0;

  return (
    <div className="space-y-4">
      {editingPanel}
      {REVIEW_ENABLED ? reviewPanel : null}

      {projects.length ? (
        <div className="flex items-center justify-end gap-1 px-1 text-[10px] leading-none">
          {(
            [
              { value: "type", label: "按类型" },
              { value: "time", label: "按时间" },
            ] as const
          ).map((option, index) => (
            <span key={option.value} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden className="text-border-strong">
                  ·
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setListMode(option.value)}
                aria-pressed={listMode === option.value}
                className={cx(
                  "rounded transition-colors",
                  listMode === option.value
                    ? "font-semibold text-ink-secondary"
                    : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                {option.label}
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {hasAnything ? (
        <div className="space-y-2.5">
          {listMode === "type"
            ? grouped.map((group) => (
                <div key={group.mode} className="space-y-2.5">
                  <div className="flex items-center gap-1.5 px-2 pt-1">
                    <span
                      aria-hidden
                      className={cx(
                        "size-2 rounded-full",
                        PROJECT_MODE_META[group.mode].swatchClass,
                      )}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      {PROJECT_MODE_META[group.mode].label}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {group.projects.length}
                    </span>
                  </div>
                  {group.projects.map((project) => (
                    <FolderBlock
                      key={project.id}
                      projectId={project.id}
                      mode={group.mode}
                      cadence={project.cadence}
                      tracks={project.tracks}
                      stage={project.stage}
                      reviews={project.reviews}
                      today={today}
                      name={project.name}
                      meta={PROJECT_MODE_META[group.mode]}
                      open={openId === project.id}
                      onToggle={() => toggleFolder(project.id)}
                      milestone={project.currentMilestone}
                      tasks={project.tasks}
                      taskView={taskView}
                      setTaskView={setTaskView}
                      showLabels={showLabels}
                    />
                  ))}
                </div>
              ))
            : byTime.map((project) => {
                const meta =
                  PROJECT_MODE_META[normalizeProjectMode(project.mode)];
                return (
                  <FolderBlock
                    key={project.id}
                    projectId={project.id}
                    mode={normalizeProjectMode(project.mode)}
                    cadence={project.cadence}
                    tracks={project.tracks}
                    stage={project.stage}
                    reviews={project.reviews}
                    today={today}
                    name={project.name}
                    meta={meta}
                    open={openId === project.id}
                    onToggle={() => toggleFolder(project.id)}
                    milestone={project.currentMilestone}
                    tasks={project.tasks}
                    taskView={taskView}
                    setTaskView={setTaskView}
                    showLabels={showLabels}
                  />
                );
              })}

          {unassociatedTasks.length ? (
            <FolderBlock
              projectId={null}
              mode={null}
              today={today}
              name="散落任务"
              meta={null}
              open={openId === UNASSIGNED_ID}
              onToggle={() => toggleFolder(UNASSIGNED_ID)}
              milestone={null}
              tasks={unassociatedTasks}
              taskView={taskView}
              setTaskView={setTaskView}
              showLabels={showLabels}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-surface/60 p-10">
          <EmptyState
            icon={FolderOpen}
            title="还没有文件夹"
            hint="写下第一个想法，AI 会把它收成一个文件夹。"
          />
        </div>
      )}
    </div>
  );
}

function FolderBlock({
  projectId,
  name,
  mode,
  tracks,
  stage,
  reviews,
  today,
  meta,
  open,
  onToggle,
  tasks,
  taskView,
  setTaskView,
  showLabels,
}: {
  projectId: string | null;
  name: string;
  mode: ProjectMode | null;
  cadence?: string | null;
  tracks?: FileTrackData[];
  stage?: {
    id: string;
    order: number;
    status: string;
    deliverable: string;
    doneWhen: string | null;
    nextStage: StagePreview | null;
  } | null;
  reviews?: Array<{ id: string; reviewDate: Date | string }>;
  today: string;
  meta: (typeof PROJECT_MODE_META)[ProjectMode] | null;
  open: boolean;
  onToggle: () => void;
  milestone: string | null;
  tasks: FileTaskData[];
  taskView: "open" | "done";
  setTaskView: (view: "open" | "done") => void;
  showLabels: boolean;
}) {
  const openTasks = tasks.filter((task) => isOpenTaskStatus(task.status));
  const dueTimes = openTasks
    .map((task) => task.dueDate)
    .filter((value): value is Date => Boolean(value))
    .map((value) => new Date(value).getTime());
  const nextDue = dueTimes.length ? new Date(Math.min(...dueTimes)) : null;
  const blockRef = useRef<HTMLDivElement>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // 展开后点任意空白处（或按 Esc）就收回
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (!blockRef.current || blockRef.current.contains(target)) return;
      // 挂到 body 上的浮动层（新手引导气泡）不算"点在外面"，
      // 否则点它的关闭按钮会先把文件夹收掉，引导步骤永远推进不了。
      if (isInsideFloatingLayer(target)) return;
      onToggle();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onToggle();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onToggle]);

  const daysLeft = nextDue
    ? Math.max(
        0,
        Math.ceil(
          (nextDue.getTime() - new Date(today + "T00:00:00").getTime()) /
            86400000,
        ),
      )
    : null;
  const completedTasks = sortCompleted(
    tasks.filter((task) => task.status === "done"),
  );
  const shown = taskView === "open" ? openTasks : completedTasks;
  // 没有推进中的任务、但确实完成过任务 = 这组事情收尾了，别说成「没有任务」。
  const allDone = openTasks.length === 0 && completedTasks.length > 0;

  return (
    <div
      ref={blockRef}
      className={cx(
        "overflow-hidden rounded-xl border transition-colors",
        open
          ? "border-border-strong bg-surface shadow-card"
          : "border-border/70 bg-surface/70 hover:bg-surface",
      )}
    >
      {/* 文件夹本身：点一下就地弹开 */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group relative block w-full pt-2 text-left"
      >
        <span
          aria-hidden
          className={cx(
            "absolute left-4 top-0 h-3 w-16 rounded-t-md transition-colors",
            meta
              ? open
                ? meta.swatchClass
                : meta.swatchClass + " opacity-70"
              : "bg-border-strong/70",
          )}
        />
        <span
          className={cx(
            "relative flex items-center gap-3 rounded-tl-md px-4 py-3",
            open && meta ? meta.softClass : "",
          )}
        >
          {open ? (
            <FolderOpen
              className={cx(
                "size-[18px] shrink-0",
                meta ? meta.textClass : "text-ink-muted",
              )}
            />
          ) : (
            <Folder
              className={cx(
                "size-[18px] shrink-0",
                meta ? meta.textClass : "text-ink-muted",
              )}
              fill="currentColor"
              fillOpacity={0.22}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {name}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
              {meta ? meta.label + " · " : ""}
              {openTasks.length
                ? openTasks.length + " 件推进中"
                : "暂无推进中的任务"}
            </span>
          </span>
          <ChevronDown
            className={cx(
              "size-4 shrink-0 text-ink-muted transition-transform",
              open ? "rotate-180" : "",
            )}
          />
        </span>
      </button>

      {open ? (
        <div className="border-t border-border/60 px-4 pb-4 pt-4 animate-[zouzou-fade-in_200ms_ease-out]">
          {/* 长期：当前/下一阶段交给下方 StagePreviewPanel（总结版），这里只留剩余天数 */}
          {mode === "longterm" && daysLeft !== null ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-border/70 bg-surface-muted/60 px-3 py-1.5 text-xs text-ink-secondary">
                还有 {daysLeft} 天
              </span>
            </div>
          ) : null}

          {mode === "longterm" && stage ? <StagePreviewPanel stage={stage} /> : null}

          {mode === "explore" ? (
            <div className="mt-3 space-y-2">
              {tracks?.length ? (
                <div className="space-y-1.5">
                  {tracks.map((track) => (
                    <div
                      key={track.id}
                      className={cx(
                        "flex items-start gap-2 rounded-lg border px-3 py-2",
                        track.role === "main"
                          ? "border-mode-explore/40 bg-mode-explore-soft/60"
                          : "border-border/60 bg-surface-muted/40",
                      )}
                    >
                      <span
                        className={cx(
                          "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          track.role === "main"
                            ? "bg-mode-explore/15 text-mode-explore-ink"
                            : "bg-surface-muted text-ink-muted",
                        )}
                      >
                        {track.role === "main" ? "主线" : "支线"}
                      </span>
                      <div className="min-w-0">
                        <span
                          className={cx(
                            "block truncate text-xs font-medium",
                            track.role === "main"
                              ? "text-mode-explore-ink"
                              : "text-ink",
                          )}
                        >
                          {track.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TaskViewSwitch
              taskView={taskView}
              setTaskView={setTaskView}
              openCount={openTasks.length}
              doneCount={completedTasks.length}
            />
            {REVIEW_ENABLED && mode === "explore" && projectId ? (
              <button
                type="button"
                onClick={() => setReviewOpen((value) => !value)}
                aria-expanded={reviewOpen}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent-strong"
              >
                <History className="size-3.5" />
                复盘
              </button>
            ) : null}

          </div>

          {REVIEW_ENABLED && reviewOpen && mode === "explore" && projectId ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-surface-muted/40">
              {reviews?.length ? (
                <div className="border-b border-border/60 p-4">
                  <p className="text-xs font-medium text-ink-secondary">
                    复盘记录
                  </p>
                  <div className="mt-2 space-y-1">
                    {reviews.map((review) => (
                      <Link
                        key={review.id}
                        href={`/files?project=${projectId}&review=${review.id}`}
                        className="flex h-8 items-center rounded-md px-2 text-sm text-ink-secondary transition-colors hover:bg-surface hover:text-accent-strong"
                      >
                        {formatDate(new Date(review.reviewDate))}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="border-b border-border/60 px-4 py-3 text-xs text-ink-muted">
                  还没有复盘记录
                </p>
              )}
              <ReviewDraftGenerator
                defaultDate={today}
                projectId={projectId}
                label="生成复盘"
              />
            </div>
          ) : null}

          {shown.length ? (
            <div className="mt-3 divide-y divide-border rounded-xl border border-border/70 bg-surface">
              {shown.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectId={projectId}
                  projectName={name}
                  showLabels={showLabels}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ListTodo}
              title={
                taskView === "done"
                  ? "还没有已完成的任务"
                  : allDone
                    ? "已全部完成"
                    : "没有推进中的任务"
              }
              hint={
                taskView === "done"
                  ? "任务完成后会自动收进这里。"
                  : allDone
                    ? undefined
                    : "写下想法时 AI 会把它拆成这里的任务。"
              }
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function TaskViewSwitch({
  taskView,
  setTaskView,
  openCount,
  doneCount,
}: {
  taskView: "open" | "done";
  setTaskView: (view: "open" | "done") => void;
  openCount: number;
  doneCount: number;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-muted p-1">
      <button
        type="button"
        onClick={() => setTaskView("open")}
        className={cx(
          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          taskView === "open"
            ? "bg-surface text-accent-strong shadow-sm"
            : "text-ink-secondary hover:text-ink",
        )}
      >
        推进中 {openCount}
      </button>
      <button
        type="button"
        onClick={() => setTaskView("done")}
        className={cx(
          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          taskView === "done"
            ? "bg-surface text-success shadow-sm"
            : "text-ink-secondary hover:text-ink",
        )}
      >
        已完成 {doneCount}
      </button>
    </div>
  );
}
