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

/**
 * 新人引导只负责「记想法 → 推进任务 → 用便利贴」三步。
 *
 * 首个任务完成后的复盘提示由 FirstTaskReviewHint 单独处理，
 * 这样用户在任何入口完成第一项任务都会看到，不用依赖引导走到哪一步。
 */
export function FirstRunTour({
  initialStep,
  context,
  hasTasks = false,
}: {
  initialStep: string;
  context: "home" | "workspace";
  hasTasks?: boolean;
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
      setStep((current) =>
        tourOrder(next) > tourOrder(current) ? next : current,
      );
      void setFirstRunTourStep(next).catch(() => {});
    }

    window.addEventListener(TOUR_EVENT, onAdvance);
    return () => window.removeEventListener(TOUR_EVENT, onAdvance);
  }, []);

  useEffect(() => {
    if (context === "workspace" && step === "1" && hasTasks) {
      setStep("2");
      persist("2");
    }
  }, [context, hasTasks, persist, step]);

  const finish = useCallback(() => {
    setStep("done");
    persist("done");
  }, [persist]);

  const effectiveStep: TourStep =
    context === "workspace" && step === "1" && hasTasks ? "2" : step;

  if (context === "home") {
    if (effectiveStep !== "1") return null;

    return (
      <AnchoredHint
        target={TOUR_TARGETS.quickCapture}
        title="先从一句话开始"
        onDismiss={finish}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>1 / 3</span>
            <button
              type="button"
              onClick={() => {
                setStep("2");
                persist("2");
              }}
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
            <span>1 / 3</span>
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

  if (effectiveStep === "2" && !hasTasks) {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.homeNav}
        title="先把想法变成一条任务"
        onDismiss={finish}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>2 / 3</span>
            <button type="button" onClick={finish} className={dismissButtonClass}>
              知道了
            </button>
          </div>
        }
      >
        点「日历」回去提交那条想法。出现任务后，再回来点下一步。
      </AnchoredHint>
    );
  }

  if (effectiveStep === "2") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.nextButton}
        title="把任务推起来"
        onDismiss={() => {
          setStep("3");
          persist("3");
        }}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>2 / 3</span>
            <button
              type="button"
              onClick={() => {
                setStep("3");
                persist("3");
              }}
              className={dismissButtonClass}
            >
              知道了
            </button>
          </div>
        }
      >
        点击【下一步】推进任务，一次只用走一小步
      </AnchoredHint>
    );
  }

  if (effectiveStep === "3") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.stickyButton}
        title="使用便利贴"
        onDismiss={finish}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>3 / 3</span>
            <button type="button" onClick={finish} className={dismissButtonClass}>
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

  return null;
}
