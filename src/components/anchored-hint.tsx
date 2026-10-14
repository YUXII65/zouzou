"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type AnchorRect = { top: number; left: number; width: number; height: number };

/**
 * 锚定气泡：指向页面上某个真实元素（data-tour 标记），跟随滚动/尺寸变化，
 * 并给目标套一圈高亮。刻意不做全屏蒙层，避免滚动、缩放、移动端键盘带来的错位。
 */
export function AnchoredHint({
  target,
  title,
  children,
  footer,
  onDismiss,
  onMissing,
  missingDelay = 2600,
}: {
  target: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onDismiss: () => void;
  onMissing?: () => void;
  missingDelay?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const bubbleRef = useRef<HTMLDivElement>(null);
  const missingReported = useRef(false);

  useEffect(() => setMounted(true), []);

  /** 选择器可以写多个（逗号分隔），取第一个真正可见的：桌面是侧栏、移动端是底部导航 */
  const visibleTarget = useCallback(() => {
    const candidates = document.querySelectorAll(target);
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      const rect = candidate.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return candidate;
    }
    return null;
  }, [target]);

  const update = useCallback(() => {
    const element = visibleTarget();
    if (!element) {
      setAnchor(null);
      setPosition(null);
      return;
    }
    const rect = element.getBoundingClientRect();

    missingReported.current = true;
    setAnchor((previous) =>
      previous &&
      Math.abs(previous.top - rect.top) < 1 &&
      Math.abs(previous.left - rect.left) < 1 &&
      Math.abs(previous.width - rect.width) < 1 &&
      Math.abs(previous.height - rect.height) < 1
        ? previous
        : {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
    );

    const width = Math.min(330, window.innerWidth - 32);
    const left = Math.max(
      16,
      Math.min(rect.right - width, window.innerWidth - width - 16),
    );
    const bubbleHeight = bubbleRef.current?.getBoundingClientRect().height ?? 150;
    const fitsBelow = rect.bottom + 12 + bubbleHeight <= window.innerHeight - 12;
    const top = fitsBelow
      ? rect.bottom + 12
      : Math.max(12, rect.top - bubbleHeight - 12);

    setPosition((previous) =>
      previous &&
      Math.abs(previous.top - top) < 1 &&
      Math.abs(previous.left - left) < 1
        ? previous
        : { top, left },
    );
  }, [visibleTarget]);

  useEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    if (!mounted) return;

    const element = visibleTarget();
    if (element) {
      const rect = element.getBoundingClientRect();
      if (rect.top < 64 || rect.bottom > window.innerHeight - 64) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    const timers = [0, 90, 220, 480].map((delay) =>
      window.setTimeout(update, delay),
    );
    const interval = window.setInterval(update, 700);
    const missingTimer = window.setTimeout(() => {
      if (!missingReported.current) onMissing?.();
    }, missingDelay);

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
      window.clearTimeout(missingTimer);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [mounted, missingDelay, onMissing, update, visibleTarget]);

  if (!mounted || !anchor || !position) return null;

  const width = Math.min(330, window.innerWidth - 32);

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[60] rounded-xl ring-2 ring-accent"
        style={{
          top: anchor.top - 5,
          left: anchor.left - 5,
          width: anchor.width + 10,
          height: anchor.height + 10,
          boxShadow: "0 0 0 6px rgba(37, 99, 235, 0.12)",
        }}
      />
      <div
        ref={bubbleRef}
        role="note"
        data-floating-layer="tour"
        style={{ top: position.top, left: position.left, width }}
        className="zouzou-panel fixed z-[61] rounded-xl p-4 shadow-pop animate-[zouzou-fade-in_240ms_ease-out]"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="关闭引导"
            title="关闭引导"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="mt-1.5 text-xs leading-5 text-ink-secondary">
          {children}
        </div>
        {footer ? <div className="mt-3">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}