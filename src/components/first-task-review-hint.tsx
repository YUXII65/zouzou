"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnchoredHint } from "@/components/anchored-hint";
import { FIRST_TASK_REVIEW_EVENT } from "@/lib/first-run-hints";
import { TOUR_TARGETS } from "@/lib/tour";

const DISMISS_KEY = "next_step_review_prompt_dismissed";
const SHOW_KEY = "next_step_show_review_hint";

/**
 * 首个任务完成后的复盘锚定提示。
 *
 * eligible 由服务端判定「有已完成任务，且一条复盘都还没有」，所以无论用户是
 * 从引导流程完成，还是直接新建任务后点完成，刷新页面都能看到提示；
 * 客户端事件只负责让它当场弹出，不必等下一次刷新。
 */
export function FirstTaskReviewHint({ eligible = false }: { eligible?: boolean }) {
  const [visible, setVisible] = useState(false);

  const showIfNeeded = useCallback(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      const flagged = localStorage.getItem(SHOW_KEY) === "1";
      if (eligible || flagged) setVisible(true);
    } catch {
      if (eligible) setVisible(true);
    }
  }, [eligible]);

  useEffect(() => {
    showIfNeeded();
    window.addEventListener(FIRST_TASK_REVIEW_EVENT, showIfNeeded);
    return () =>
      window.removeEventListener(FIRST_TASK_REVIEW_EVENT, showIfNeeded);
  }, [showIfNeeded]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
      localStorage.removeItem(SHOW_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  if (!visible) return null;

  return (
    <AnchoredHint
      target={TOUR_TARGETS.reviewNav}
      title="抽屉复盘"
      onDismiss={dismiss}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/review"
            onClick={dismiss}
            className="zouzou-primary-button inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
          >
            去复盘
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
          >
            稍后
          </button>
        </div>
      }
    >
      你的第一项任务已完成。点左侧【抽屉】，用复盘留下今天的判断和明天的方向。
    </AnchoredHint>
  );
}
