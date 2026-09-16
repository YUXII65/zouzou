"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BarChart3,
  Blocks,
  BookOpen,
  CalendarDays,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { cx } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileCard, type ProfileUser } from "@/components/profile-card";

const navItems = [
  { href: "/", label: "日历", icon: CalendarDays },
  { href: "/workspace", label: "书桌", icon: BookOpen },
  { href: "/review", label: "抽屉", icon: Archive },
];

export function Sidebar({
  isAdmin = false,
  user = null,
}: {
  isAdmin?: boolean;
  user?: ProfileUser | null;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      <header className="zouzou-glass sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border/70 px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <BrandMark className="size-7 rounded-lg" />
          <span className="text-sm font-semibold">走走</span>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin ? (
            <Link
              href="/admin"
              aria-label="使用情况"
              title="使用情况"
              className="zouzou-icon-button flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <BarChart3 className="size-[18px]" />
            </Link>
          ) : null}
          <Link
            href="/tools"
            aria-label="工具匣"
            title="工具匣"
            className="zouzou-icon-button flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Blocks className="size-[18px]" />
          </Link>
          <ThemeToggle />
          {user ? <ProfileCard user={user} placement="header" /> : null}
        </div>
      </header>

      <aside className="zouzou-glass fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center border-r border-border/70 py-4 lg:flex">
        <Link
          href="/"
          aria-label="走走"
          className="flex size-10 items-center justify-center rounded-lg"
        >
          <BrandMark className="size-10 rounded-xl" />
        </Link>

        <nav data-tour="side-nav" className="mt-6 flex flex-1 flex-col items-center gap-1.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                data-tour={
                  item.href === "/"
                    ? "home-nav"
                    : item.href === "/review"
                      ? "review-nav"
                      : undefined
                }
                aria-label={item.label}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex size-10 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-accent-soft text-accent-strong after:absolute after:left-0 after:top-1/2 after:h-5 after:w-0.5 after:-translate-y-1/2 after:rounded-r-full after:bg-accent"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                <Icon className="size-[18px]" />
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-1.5">
          {isAdmin ? (
            <Link
              href="/admin"
              aria-label="使用情况"
              title="使用情况"
              className="zouzou-icon-button flex size-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <BarChart3 className="size-[18px]" />
            </Link>
          ) : null}
          <Link
            href="/tools"
            aria-label="工具匣"
            title="工具匣"
            className="zouzou-icon-button flex size-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Blocks className="size-[18px]" />
          </Link>
          <ThemeToggle />
          {user ? <ProfileCard user={user} placement="rail" /> : null}
        </div>
      </aside>

      <nav data-tour="bottom-nav" className="zouzou-glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border/70 lg:hidden">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              data-tour={
                item.href === "/"
                  ? "home-nav"
                  : item.href === "/review"
                    ? "review-nav"
                    : undefined
              }
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium",
                active ? "text-accent" : "text-ink-muted",
              )}
            >
              <Icon className="size-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
