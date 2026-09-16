"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { startGuestExperience } from "@/app/actions";

export function GuestStartButton({ className }: { className?: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={className}
      >
        游客体验
      </button>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-confirm-title"
        >
          <div className="zouzou-panel w-full max-w-sm rounded-xl p-6 shadow-pop">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <ShieldAlert className="size-4" />
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                aria-label="关闭"
                title="关闭"
                className="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <h2
              id="guest-confirm-title"
              className="mt-3 text-sm font-semibold text-ink"
            >
              先从游客体验？
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              游客内容只保存在这台浏览器，换设备或清理浏览器就会丢失。建议先注册，之后的内容才能长期保留。
            </p>
            <div className="mt-5 grid gap-2">
              <Link
                href="/login?mode=register"
                className="zouzou-primary-button inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                先去注册
              </Link>
              <form action={startGuestExperience}>
                <button
                  type="submit"
                  className="zouzou-secondary-button inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
                >
                  继续游客体验
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
