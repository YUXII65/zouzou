"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { logoutUser } from "@/app/actions";

export function LogoutButton({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <form ref={formRef} action={logoutUser}>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="退出登录"
          aria-haspopup="dialog"
          className={className}
        >
          <LogOut className={showLabel ? "size-4" : "size-[18px]"} />
          {showLabel ? <span>退出登录</span> : null}
        </button>
      </form>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
        >
          <div className="zouzou-panel w-full max-w-xs rounded-xl p-4 shadow-pop">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-secondary">
                <LogOut className="size-4" />
              </span>
              <div>
                <h2
                  id="logout-confirm-title"
                  className="text-sm font-semibold text-ink"
                >
                  退出登录？
                </h2>

              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="zouzou-secondary-button inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
              >
                再想想
              </button>
              <button
                type="button"
                onClick={() => formRef.current?.requestSubmit()}
                className="zouzou-primary-button inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
