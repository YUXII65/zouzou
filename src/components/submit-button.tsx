"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRotatingText } from "@/components/rotating-text";

/**
 * 统一的提交按钮。
 * pending 时保留明确文案和旋转状态，结束后再刷新服务端数据。
 */
export function SubmitButton({
  children,
  pendingText = "处理中...",
  slowPendingText,
  rotatingText,
  className,
  disabled = false,
  refreshOnSuccess = true,
}: {
  children: ReactNode;
  pendingText?: string | null;
  slowPendingText?: string;
  rotatingText?: string[];
  className?: string;
  disabled?: boolean;
  refreshOnSuccess?: boolean;
}) {
  const { pending } = useFormStatus();
  const router = useRouter();
  const wasPending = useRef(false);
  const [slow, setSlow] = useState(false);
  const rotatingLabel = useRotatingText(
    pending && pendingText !== null,
    rotatingText ?? [],
  );

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
      : rotatingText?.length
        ? rotatingLabel
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
