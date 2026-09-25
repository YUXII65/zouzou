"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnchoredHint } from "@/components/anchored-hint";
import { setFirstRunTourStep } from "@/app/actions";
import {
  normalizeTourStep,
  TOUR_EVENT,
  TOUR_STORAGE_KEY,
  TOUR_TARGETS,
  tourOrder,
  type TourStep,
} from "@/lib/tour";

const dismissButtonClass =
  "inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent";
const primaryButtonClass =
  "zouzou-primary-button inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong";

/**
 * 统一的新人引导：记想法 → 推进任务 → 便利贴 → 抽屉复盘。
 *
 * 前 3 步由用户在首页 / 书桌页自然触发，第 4 步只在首组任务完整收尾后出现。
 * 复盘不再是独立弹层，而是这套 4 步引导的最后一环。
 */
export function FirstRunTour({
  initialStep,
  context,
  hasTasks = false,
  reviewEligible = false,
}: {
  initialStep: string;
  context: "home" | "workspace";
  hasTasks?: boolean;
  reviewEligible?: boolean;
}) {
  const [step, setStep] = useState<TourStep>(() =>
    normalizeTourStep(initialStep),
  );

  const persist = useCallback((next: TourStep) => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors.
    }
    void setFirstRunTourStep(next).catch(() => {});
  }, []);

  const advance = useCallback(
    (next: TourStep) => {
      setStep(next);
      persist(next);
    },
    [persist],
  );

  const finish = useCallback(() => {
    advance("done");
  }, [advance]);

  useEffect(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, step);
    } catch {
      // Ignore storage errors.
    }
  }, [step]);

  useEffect(() => {
    function onAdvance(event: Event) {
      const detail = (event as CustomEvent<{ step?: unknown }>).detail;
      const next = normalizeTourStep(detail?.step);
      if (tourOrder(next) <= tourOrder(step)) return;
      setStep(next);
      void setFirstRunTourStep(next).catch(() => {});
    }

    window.addEventListener(TOUR_EVENT, onAdvance);
    return () => window.removeEventListener(TOUR_EVENT, onAdvance);
  }, [step]);

  useEffect(() => {
    if (context === "workspace" && step === "1" && hasTasks) {
      advance("2");
    }
  }, [advance, context, hasTasks, step]);

  const effectiveStep: TourStep =
    context === "workspace" && step === "1" && hasTasks ? "2" : step;

  if (context === "home" && effectiveStep === "1") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.quickCapture}
        title="先从一句话开始"
        onDismiss={finish}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>1 / 4</span>
            <button
              type="button"
              onClick={() => advance("2")}
              className={dismissButtonClass}
            >
              知道了
            </button>
          </div>
        }
      >
        把脑子里那件事直接倒出来，不用整理。点「下一步」后，走走会先问你几句，再把它变成能开始的行动。
      </AnchoredHint>
    );
  }

  if (effectiveStep === "1") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.homeNav}
        title="先回日历记一个想法"
        onDismiss={finish}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>1 / 4</span>
            <button type="button" onClick={finish} className={dismissButtonClass}>
              知道了
            </button>
          </div>
        }
      >
        点左侧「日历」，先把一件真实的事写下来。后面所有项目、任务和复盘都会从这里长出来。
      </AnchoredHint>
    );
  }


  if (effectiveStep === "2") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.nextButton}
        title="把任务推起来"
        onDismiss={() => advance("3")}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>2 / 4</span>
            <button
              type="button"
              onClick={() => advance("3")}
              className={dismissButtonClass}
            >
              知道了
            </button>
          </div>
        }
      >
        点击【下一步】推进任务，一次只推进一个完整动作
      </AnchoredHint>
    );
  }

  if (effectiveStep === "3") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.stickyButton}
        title="使用便利贴"
        onDismiss={() => advance("4")}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>3 / 4</span>
            <button
              type="button"
              onClick={() => advance("4")}
              className={dismissButtonClass}
            >
              知道了
            </button>
          </div>
        }
      >
        <span className="block">点一下【便利贴】，AI 会为你写一张详细执行步骤。</span>
        <span className="mt-1 block">你也可以补充自己的想法或卡点。</span>
      </AnchoredHint>
    );
  }

  if (effectiveStep === "4" && reviewEligible) {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.reviewNav}
        title="抽屉复盘"
        onDismiss={finish}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>4 / 4</span>
            <div className="flex items-center gap-2">
              <Link href="/review" onClick={finish} className={primaryButtonClass}>
                去复盘
              </Link>
              <button type="button" onClick={finish} className={dismissButtonClass}>
                稍后
              </button>
            </div>
          </div>
        }
      >
        首组任务已完成。点左侧【抽屉】，用复盘留下今天的判断和明天的方向。
      </AnchoredHint>
    );
  }

  return null;
}
