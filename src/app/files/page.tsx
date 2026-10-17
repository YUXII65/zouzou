import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { History, ListTodo } from "lucide-react";
import { Panel, PanelHeader } from "@/components/panel";
import { TaskForm } from "@/components/task-form";
import { ReviewView } from "@/components/review-view";
import { ReviewPanelShell } from "@/components/review-panel-shell";
import { updateTask } from "@/app/actions";
import { FirstRunTour } from "@/components/first-run-tour";
import { FilesFirstSticker } from "@/components/files-first-sticker";
import { FIRST_RUN_TOUR_ENABLED } from "@/lib/tour";
import { REVIEW_ENABLED } from "@/lib/review-feature";
import { generateLongtermStagePreview } from "@/lib/project-progress-agent";
import {
  FileBrowser,
  UNASSIGNED_ID,
} from "@/components/file-browser";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, readSessionUserId } from "@/lib/auth";
import { getFirstRunState } from "@/lib/first-run";
import { buildFilesView } from "@/lib/files-view";
import { toDateInputValue } from "@/lib/date";

export const metadata = {
  title: "文件",
};

export const dynamic = "force-dynamic";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 先解 cookie 拿 userId（不查库），把「查用户」并进 repair / firstRun 那一批，
  // 于是读路径从 3 个串行往返压到 2 个。
  const userId = await readSessionUserId();
  if (!userId) redirect("/login");
  const params = await searchParams;

  // 新手状态只读、repair 是写：两者互不依赖可以并发。
  // repair 必须在读项目/任务之前完成，否则可能读到归属改到一半的数据。
  const userPromise = getCurrentUser();
  const firstRun = await getFirstRunState(userId);
  const user = await userPromise;
  if (!user) redirect("/login");
  const projectParam =
    typeof params.project === "string" ? params.project : "";
  const viewParam = typeof params.view === "string" ? params.view : "";
  const editParam = typeof params.edit === "string" ? params.edit : "";
  const reviewParam =
    typeof params.review === "string" ? params.review : "";

  // 文件页数据走两端共用的视图契约，小程序文件页消费同一份。
  const view = await buildFilesView({ userId: user.id });
  const {
    projects: browserProjects,
    unassociatedTasks: browserUnassociatedTasks,
    missingStagePreviewIds,
  } = view;

  // 当前阶段进行中或待确认时还没生成下一阶段总结，进页面时后台补一次。
  // 一次打开页面最多补 3 个，避免 longterm 项目多时集中打 AI。
  if (missingStagePreviewIds.length) {
    after(async () => {
      for (const stageId of missingStagePreviewIds.slice(0, 3)) {
        await generateLongtermStagePreview({
          userId: user.id,
          stageId,
        }).catch(() => {});
      }
    });
  }

  const tasks = [
    ...browserProjects.flatMap((project) => project.tasks),
    ...browserUnassociatedTasks,
  ];

  const editingTask = editParam
    ? (tasks.find((task) => task.id === editParam) ?? null)
    : null;
  const editReturnTo = editingTask?.projectId
    ? "/files?project=" + editingTask.projectId
    : "/files";

  const activeReview = REVIEW_ENABLED && reviewParam
    ? await prisma.review.findFirst({
        where: { id: reviewParam, userId: user.id },
        select: {
          id: true,
          summary: true,
          nextActions: true,
          status: true,
          projectId: true,
        },
      })
    : null;
  const today = toDateInputValue(new Date());

  const showUnassigned = viewParam === "unassigned";
  // 手上没有明确要打开哪个文件夹时，全部保持收起状态。
  const initialProjectId = showUnassigned
    ? UNASSIGNED_ID
    : (browserProjects.find((project) => project.id === projectParam)?.id ?? null);

  return (
    <>
      {FIRST_RUN_TOUR_ENABLED ? (
        <>
          <FirstRunTour
            initialStep={firstRun.tourStep}
            context="workspace"
            hasTasks={tasks.length > 0}
            enabled={firstRun.isFirstRun}
          />
          <FilesFirstSticker
            enabled={firstRun.isFirstRun && firstRun.tourStep === "done"}
          />
        </>
      ) : null}

      <FileBrowser
        projects={browserProjects}
        unassociatedTasks={browserUnassociatedTasks}
        initialProjectId={
          editingTask?.projectId ? editingTask.projectId : initialProjectId
        }
        today={today}
        showLabels={FIRST_RUN_TOUR_ENABLED && firstRun.isFirstRun}
        reviewPanel={
          REVIEW_ENABLED && activeReview ? (
            <ReviewPanelShell
              closeHref={
                activeReview.projectId
                  ? "/files?project=" + activeReview.projectId
                  : "/files"
              }
            >
            <Panel>
              <PanelHeader
                title="复盘"
                icon={History}
                action={
                  <Link
                    href={
                      activeReview.projectId
                        ? "/files?project=" + activeReview.projectId
                        : "/files"
                    }
                    className="text-xs font-medium text-ink-muted transition-colors hover:text-ink"
                  >
                    关闭
                  </Link>
                }
              />
              <ReviewView summary={activeReview.summary} />
            </Panel>
            </ReviewPanelShell>
          ) : null
        }
        editingPanel={
          editingTask ? (
            <Panel>
              <PanelHeader
                title="编辑任务"
                icon={ListTodo}
                action={
                  <Link
                    href={editReturnTo}
                    className="text-xs font-medium text-ink-muted transition-colors hover:text-ink"
                  >
                    关闭编辑
                  </Link>
                }
              />
              <TaskForm
                action={updateTask}
                task={editingTask}
                returnTo={editReturnTo}
                submitLabel="保存任务"
              />
            </Panel>
          ) : null
        }
      />
    </>
  );
}
