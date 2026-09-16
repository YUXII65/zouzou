"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * 统一的提交按钮。
 * pending 时保留明确文案和旋转状态，结束后再刷新服务端数据。
 */
export function SubmitButton({
  children,
  pendingText = "处理中...",
  slowPendingText,
  className,
  disabled = false,
  refreshOnSuccess = true,
}: {
  children: ReactNode;
  pendingText?: string | null;
  slowPendingText?: string;
  className?: string;
  disabled?: boolean;
  refreshOnSuccess?: boolean;
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
      if (refreshOnSuccess) router.refresh();
    }
  }, [pending, refreshOnSuccess, router]);

  const label = pending
    ? pendingText === null
      ? children
      : slow
        ? (slowPendingText ?? pendingText)
        : pendingText
    : children;

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={className}
    >
      {pending && pendingText !== null ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : null}
      {label}
    </button>
  );
}
