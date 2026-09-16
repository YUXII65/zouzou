"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * 统一的提交按钮。
 *
 * 除了 pending 文案，这里还负责两件事：
 * 1. 操作结束后主动 router.refresh()，避免服务端已经写好结果、页面却还停在旧状态；
 * 2. pending 超过几秒后给出刷新入口，让用户不必等未知的时长。
 */
export function SubmitButton({
  children,
  pendingText = "处理中...",
  slowPendingText,
  className,
  disabled = false,
}: {
  children: ReactNode;
  pendingText?: string | null;
  slowPendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const router = useRouter();
  const wasPending = useRef(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      setSlow(false);
      const timer = window.setTimeout(() => setSlow(true), 8000);
      return () => window.clearTimeout(timer);
    }

    setSlow(false);
    if (wasPending.current) {
      wasPending.current = false;
      router.refresh();
    }
  }, [pending, router]);

  const label = pending
    ? slow
      ? (slowPendingText ?? pendingText)
      : pendingText
    : children;

  const button = (
    <button
      type="submit"
      disabled={pending || disabled}
      className={className}
    >
      {label}
    </button>
  );

  if (!pending) return button;

  return (
    <span className="inline-flex items-center gap-2">
      {button}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          router.refresh();
        }}
        aria-label="刷新查看结果"
        title="刷新查看结果"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink-muted transition-colors hover:border-accent hover:text-accent"
      >
        <RefreshCw className="size-3.5" />
      </button>
    </span>
  );
}
