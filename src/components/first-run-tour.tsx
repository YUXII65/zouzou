"use client";

import { useCallback, useEffect, useState } from "react";
import { AnchoredHint } from "@/components/anchored-hint";
import { setFirstRunTourStep } from "@/app/actions";
import {
  normalizeTourStep,
  TOUR_EVENT,
  TOUR_FORCE_STORAGE_KEY,
  TOUR_STORAGE_KEY,
  TOUR_TARGETS,
  tourOrder,
  type TourStep,
} from "@/lib/tour";

const dismissButtonClass =
  "inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent";

/**
 * 统一的新人引导：记想法 → 推进任务 → 便利贴。
 *
 * 三步都由用户在首页 / 书桌页自然触发。
 */
export function FirstRunTour({
  initialStep,
  context,
  hasTasks = false,
  enabled = true,
}: {
  initialStep: string;
  context: "home" | "workspace";
  hasTasks?: boolean;
  enabled?: boolean;
}) {
  const [step, setStep] = useState<TourStep>(() =>
    normalizeTourStep(initialStep),
  );
  const [forced, setForced] = useState(false);

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
    try {
      localStorage.removeItem(TOUR_FORCE_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
    setForced(false);
    advance("done");
  }, [advance]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let force = params.get("tour") === "1";
    try {
      if (force) localStorage.setItem(TOUR_FORCE_STORAGE_KEY, "1");
      else force = localStorage.getItem(TOUR_FORCE_STORAGE_KEY) === "1";
    } catch {
      // Ignore storage errors.
    }
    if (force) {
      setForced(true);
      setStep("1");
    }
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

  const active = enabled || forced;
  if (!active) return null;

  const effectiveStep: TourStep =
    context === "workspace" && step === "1" && hasTasks ? "2" : step;

  if (context === "home" && effectiveStep === "1") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.quickCapture}
        title="从真实的想法开始"
        onDismiss={finish}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>1 / 3</span>
            <button
              type="button"
              onClick={() => advance("2")}
              className={dismissButtonClass}
            >
              去试试
            </button>
          </div>
        }
      >
        不必在意写的好不好，走走会帮你理解并规划
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
        点左侧「日历」，先把一件真实的事写下来。后面所有项目和任务都会从这里长出来。
      </AnchoredHint>
    );
  }


  if (effectiveStep === "2") {
    return (
      <AnchoredHint
        target={TOUR_TARGETS.clarifyOptions}
        title="挑选最符合情况的选项"
        onDismiss={() => advance("3")}
        footer={
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>2 / 3</span>
            <button
              type="button"
              onClick={() => advance("3")}
              className={dismissButtonClass}
            >
              明白了
            </button>
          </div>
        }
      >
        为了更好的了解你，建议手动输入
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
            <button
              type="button"
              onClick={finish}
              className={dismissButtonClass}
            >
              知道了
            </button>
          </div>
        }
      >
        点击任务，便利贴会尽可能辅助你执行
      </AnchoredHint>
    );
  }

  return null;
}
