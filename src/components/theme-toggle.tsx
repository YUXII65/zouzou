"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Moon, Sun } from "lucide-react";

const THEME_STORAGE = "theme";

/**
 * 主题开关。v3.4 起从左侧栏搬到个人页：
 * - icon：图标按钮（紧凑入口）
 * - row：个人页功能区里的按钮，和「退出登录」并排，尺寸、圆角、边框保持一致
 */
export function ThemeToggle({
  variant = "icon",
  className = "",
}: {
  variant?: "icon" | "row";
  className?: string;
}) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem(THEME_STORAGE);
      const prefersDark =
        !stored && window.matchMedia("(prefers-color-scheme: dark)").matches;
      setDark(stored === "dark" || prefersDark);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function setTheme(next: boolean) {
    setDark(next);
    localStorage.setItem(THEME_STORAGE, next ? "dark" : "light");
  }

  if (variant === "row") {
    return (
      // 开关样式：左侧固定标签，右侧显示当前开/关状态（与「API 连接」的槽位对齐）。
      <button
        type="button"
        onClick={() => setTheme(!dark)}
        aria-label={dark ? "关闭夜间模式" : "开启夜间模式"}
        aria-pressed={dark}
        title={dark ? "关闭夜间模式" : "开启夜间模式"}
        className={`flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-surface/70 px-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink sm:gap-3 sm:px-4 sm:text-sm ${className}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Moon className="size-3.5 shrink-0" />
          <span className="truncate">夜间模式</span>
        </span>
        <span
          className={
            dark
              ? "inline-flex shrink-0 items-center gap-1 text-xs text-success"
              : "inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted"
          }
        >
          {dark ? (
            <>
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span className="hidden truncate sm:inline">已开启</span>
            </>
          ) : (
            <>
              <Circle className="size-3.5 shrink-0" />
              <span className="hidden truncate sm:inline">已关闭</span>
            </>
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(!dark)}
      aria-label={dark ? "切换到白天模式" : "切换到夜晚模式"}
      title={dark ? "切换到白天" : "切换到夜晚"}
      className="zouzou-icon-button flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
