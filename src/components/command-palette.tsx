"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Download,
  FolderTree,
  Home,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cx } from "@/lib/utils";

const actions = [
  {
    id: "home",
    label: "首页",
    description: "记录想法，看今天要做什么",
    href: "/",
    icon: Home,
  },
  {
    id: "files",
    label: "文件",
    description: "按模式浏览文件夹和任务",
    href: "/files",
    icon: FolderTree,
  },
  {
    id: "profile",
    label: "个人",
    description: "账号名片与三个模式的推进数量",
    href: "/profile",
    icon: UserRound,
  },
  {
    id: "landing",
    label: "营销落地页",
    description: "预览对外产品定位与演示",
    href: "/landing",
    icon: Sparkles,
  },
  {
    id: "export-json",
    label: "导出 JSON 数据",
    description: "导出项目、任务、收件箱和复盘",
    href: "/api/export",
    icon: Download,
  },
] as const;

const adminAction = {
  id: "admin",
  label: "使用情况",
  description: "查看注册用户、活跃和 AI 成本",
  href: "/admin",
  icon: BarChart3,
} as const;

export function CommandPalette({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allActions = useMemo(
    () => (isAdmin ? [...actions, adminAction] : [...actions]),
    [isAdmin],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return allActions;
    return allActions.filter((action) =>
      `${action.label} ${action.description}`.toLowerCase().includes(keyword),
    );
  }, [allActions, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setSelectedIndex(0);
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function onOpen() {
      setQuery("");
      setSelectedIndex(0);
      setOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  function choose(index: number) {
    const action = filtered[index];
    if (!action) return;
    setOpen(false);
    if (action.href.startsWith("/api/")) {
      window.location.href = action.href;
    } else {
      router.push(action.href);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % Math.max(filtered.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) =>
        index <= 0 ? Math.max(filtered.length - 1, 0) : index - 1,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(selectedIndex);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[12vh] backdrop-blur-xl"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="zouzou-panel w-full max-w-xl overflow-hidden rounded-xl shadow-pop animate-[zouzou-fade-in_240ms_ease-out]"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="全局命令面板"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="搜索页面或操作"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-muted">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length ? (
            filtered.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => choose(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cx(
                    "zouzou-icon-button flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                    index === selectedIndex
                      ? "bg-accent-soft text-ink"
                      : "text-ink-secondary",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{action.label}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {action.description}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">
              没有匹配的页面或操作
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
