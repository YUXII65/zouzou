"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { generateTodaySuggestion } from "@/app/actions";

/**
 * 「今天要做」标题右侧只保留条数。
 * 当天还没有推荐时，静默补算一次（同一会话只试一次，避免反复触发）。
 */
export function TodayFocusControls({
  count,
  hasFocus,
  dateKey,
}: {
  count: number;
  hasFocus: boolean;
  dateKey: string;
}) {
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    if (hasFocus || attempted.current) return;
    if (typeof window === "undefined") return;

    const guard = `today_focus_attempt:${dateKey}`;
    try {
      if (sessionStorage.getItem(guard)) return;
      sessionStorage.setItem(guard, "1");
    } catch {
      // 隐私模式下拿不到 sessionStorage，仍然尝试一次。
    }

    attempted.current = true;
    void generateTodaySuggestion([], new FormData())
      .then(() => router.refresh())
      .catch(() => {});
  }, [dateKey, hasFocus, router]);

  return (
    <span className="text-xs font-medium text-ink-muted">{count} 条</span>
  );
}
