import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  NotebookPen,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageHint } from "@/components/page-hint";
import { Panel, PanelHeader } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ReviewDraftFeedback } from "@/components/review-draft-feedback";
import { ReviewDraftGenerator } from "@/components/review-draft-generator";
import { ReviewSaveForm } from "@/components/review-save-form";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getFirstRunState } from "@/lib/first-run";
import { cx } from "@/lib/utils";
import { endOfDay, formatDate, toDateInputValue } from "@/lib/date";

export const dynamic = "force-dynamic";

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const firstRun = await getFirstRunState(user.id, user.createdAt);
  const params = await searchParams;
  const dateParam =
    typeof params.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : toDateInputValue(new Date());

  const reviews = await prisma.review.findMany({
    where: { userId: user.id },
    include: {
      tasks: {
        include: {
          project: { select: { name: true } },
        },
      },
      nextActionTasks: {
        include: { task: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { reviewDate: "desc" },
  });

  const selectedReview =
    reviews.find(
      (review) => toDateInputValue(review.reviewDate) === dateParam,
    ) ?? null;
  const reviewHasNewCompletions = selectedReview
    ? (await prisma.task.count({
        where: {
          userId: user.id,
          status: "done",
          completedAt: {
            gt: selectedReview.updatedAt,
            lte: endOfDay(selectedReview.reviewDate),
          },
        },
      })) > 0
    : false;
  const reviewSavedAlready =
    selectedReview?.status === "final" && !reviewHasNewCompletions;

  const weekStart = startOfWeek(new Date());
  const weekReviews = reviews.filter((review) => review.reviewDate >= weekStart);
  const weekCompleted = weekReviews.flatMap((review) =>
    review.tasks.filter((task) => task.statusAtReview === "done"),
  );
  const weekOpen = weekReviews.flatMap((review) =>
    review.tasks.filter(
      (task) =>
        task.statusAtReview !== "done" &&
        task.statusAtReview !== "cancelled",
    ),
  );
  const weekProjects = Array.from(
    new Set(
      weekReviews
        .flatMap((review) => review.tasks)
        .map((task) => task.project?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  );

  const today = toDateInputValue(new Date());
  const todayReview = reviews.find(
    (review) => toDateInputValue(review.reviewDate) === today,
  );

  return (
    <>
      <PageHeader
        title="抽屉"
      />

      <PageHint
        id="review-v2"
        title="提示"
        enabled={firstRun.isFirstRun || reviews.length === 0}
      >
        每日复盘，并给出明天的执行建议
      </PageHint>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel className="min-w-0 self-start">
          <PanelHeader
            title="历史复盘"
            icon={CalendarDays}
            action={
              <span className="text-xs font-medium text-ink-muted">
                {reviews.length} 份
              </span>
            }
          />
          <div className="p-2">
            <Link
              href={`/review?date=${today}`}
              className={cx(
                "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                !selectedReview || toDateInputValue(selectedReview.reviewDate) === today
                  ? "relative bg-accent-soft font-medium text-accent-strong after:absolute after:left-0 after:top-1/2 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-r-full after:bg-accent"
                  : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
              )}
            >
              <span>今天</span>
              <span className="text-xs text-ink-muted">
                {todayReview
                  ? todayReview.status === "final"
                    ? "已保存"
                    : "草稿"
                  : "未写"}
              </span>
            </Link>

            {reviews.length ? (
              <div className="mt-1 space-y-1">
                {reviews
                  .filter(
                    (review) => toDateInputValue(review.reviewDate) !== today,
                  )
                  .map((review) => {
                  const active =
                    toDateInputValue(review.reviewDate) === dateParam;
                  const completed = review.tasks.filter(
                    (task) => task.statusAtReview === "done",
                  ).length;
                  const open = review.tasks.filter(
                    (task) =>
                      task.statusAtReview !== "done" &&
                      task.statusAtReview !== "cancelled",
                  ).length;
                  return (
                    <Link
                      key={review.id}
                      href={`/review?date=${toDateInputValue(review.reviewDate)}`}
                      className={cx(
                        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "relative bg-accent-soft font-medium text-accent-strong after:absolute after:left-0 after:top-1/2 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-r-full after:bg-accent"
                          : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {formatDate(review.reviewDate)}
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {completed} / {open}
                      </span>
                    </Link>
                  );
                  })}
              </div>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">
                还没有历史复盘
              </p>
            )}
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader
              title={selectedReview ? "当日复盘" : "写今日复盘"}
              icon={NotebookPen}
              action={
                selectedReview ? (
                  <StatusBadge status={selectedReview.status} />
                ) : null
              }
            />

            {selectedReview ? (
              <>
                <ReviewDraftFeedback reviewId={selectedReview.id} />

                <ReviewSaveForm
                  reviewId={selectedReview.id}
                  summary={selectedReview.summary}
                  nextActions={selectedReview.nextActions ?? ""}
                  savedAlready={reviewSavedAlready}
                />
              </>
            ) : (
              <ReviewDraftGenerator defaultDate={dateParam} />
            )}
          </Panel>

          {selectedReview ? (
            <Panel>
              <PanelHeader
                title="当日任务"
                icon={NotebookPen}
                action={
                  <span className="text-xs font-medium text-ink-muted">
                    {selectedReview.tasks.length} 条
                  </span>
                }
              />
              {selectedReview.tasks.length ? (
                <div className="divide-y divide-border">
                  {selectedReview.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm text-ink"
                    >
                      {task.statusAtReview === "done" ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" />
                      ) : (
                        <CircleDashed className="size-4 shrink-0 text-warning" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {task.titleAtReview}
                      </span>
                      {task.project?.name ? (
                        <span className="shrink-0 text-xs text-ink-muted">
                          {task.project.name}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={NotebookPen}
                  title="当天没有任务记录"
                  hint="完成今日任务后，这里会自动显示完成情况。"
                />
              )}
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader
              title="本周回看"
              icon={CalendarDays}
              action={
                <span className="text-xs font-medium text-ink-muted">
                  {weekReviews.length} 份每日复盘
                </span>
              }
            />
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="zouzou-panel rounded-xl border-success/15 bg-success/5 px-3 py-3">
                <p className="text-xs text-success">本周完成</p>
                <p className="mt-1 text-2xl font-semibold text-ink">
                  {weekCompleted.length}
                </p>
              </div>
              <div className="zouzou-panel rounded-xl border-warning/15 bg-warning/5 px-3 py-3">
                <p className="text-xs text-warning">待推进</p>
                <p className="mt-1 text-2xl font-semibold text-ink">
                  {weekOpen.length}
                </p>
              </div>
              <div className="zouzou-panel rounded-xl bg-surface-muted px-3 py-3">
                <p className="text-xs text-ink-secondary">涉及项目</p>
                <p className="mt-1 text-2xl font-semibold text-ink">
                  {weekProjects.length}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
