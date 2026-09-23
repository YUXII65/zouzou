"use client";

import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Loader2 } from "lucide-react";

const firstInputClass =
  "zouzou-input mt-4 w-full rounded-lg px-3 py-2 text-sm text-ink";
const inputClass =
  "zouzou-input mt-3 w-full rounded-lg px-3 py-2 text-sm text-ink";
const submitClass =
  "zouzou-primary-button mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong";
function AuthSubmitButton({
  pending,
  pendingText,
  children,
  className,
}: {
  pending: boolean;
  pendingText: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {pending ? pendingText : children}
    </button>
  );
}

function authError(error: string, mode: "login" | "register") {
  if (error === "system") {
    return "服务暂时不可用，请稍后重试。";
  }

  if (mode === "login" && error === "login") {
    return "用户名或密码不对。";
  }

  if (mode === "register" && error === "register") {
    return "用户名或密码不正确，或该账号已存在。";
  }

  return null;
}

export function AuthCard({
  next,
  error,
  initialMode,
}: {
  next: string;
  error: string;
  initialMode?: "login" | "register";
}) {
  const [mode] = useState<"login" | "register">(
    initialMode ?? (error === "register" ? "register" : "login"),
  );
  const [confirming, setConfirming] = useState(false);
  const [pendingUsername, setPendingUsername] = useState("");
  const [submitting, setSubmitting] = useState<"login" | "register" | null>(
    null,
  );
  const registerFormRef = useRef<HTMLFormElement>(null);
  const allowSubmitRef = useRef(false);
  const errorText = authError(error, mode);

  function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowSubmitRef.current) {
      allowSubmitRef.current = false;
      setSubmitting("register");
      return;
    }

    event.preventDefault();
    const username = String(
      new FormData(event.currentTarget).get("username") ?? "",
    ).trim();
    setPendingUsername(username);
    setConfirming(true);
  }

  function confirmRegistration() {
    setConfirming(false);
    allowSubmitRef.current = true;
    registerFormRef.current?.requestSubmit();
  }

  return (
    <>
      {mode === "login" ? (
        <form
          action="/api/auth/login"
          method="post"
          onSubmit={() => setSubmitting("login")}
          className="zouzou-panel rounded-xl p-6 sm:p-7"
        >
          <input type="hidden" name="next" value={next} />
          <h2 className="text-sm font-semibold text-ink">注册 / 登录</h2>
          <input
            name="username"
            required
            minLength={2}
            maxLength={20}
            autoComplete="username"
            placeholder="用户名"
            className={firstInputClass}
          />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="密码"
            className={inputClass}
          />
          {errorText ? (
            <p className="mt-3 text-sm text-danger">{errorText}</p>
          ) : null}
          <AuthSubmitButton
            pending={submitting === "login"}
            pendingText="正在登录..."
            className={submitClass}
          >
            确认
          </AuthSubmitButton>
        </form>
      ) : (
        <form
          ref={registerFormRef}
          action="/api/auth/register"
          method="post"
          onSubmit={handleRegisterSubmit}
          className="zouzou-panel rounded-xl p-6 sm:p-7"
        >
          <input type="hidden" name="next" value={next} />
          <h2 className="text-sm font-semibold text-ink">注册 / 登录</h2>
          <input
            name="username"
            required
            minLength={2}
            maxLength={20}
            autoComplete="username"
            placeholder="用户名"
            className={firstInputClass}
          />
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="密码（至少 6 位）"
            className={inputClass}
          />
          {errorText ? (
            <p className="mt-3 text-sm text-danger">{errorText}</p>
          ) : null}
          <AuthSubmitButton
            pending={submitting === "register"}
            pendingText="正在注册..."
            className={submitClass}
          >
            确认
          </AuthSubmitButton>
        </form>
      )}

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-confirm-title"
        >
          <div className="zouzou-panel w-full max-w-sm rounded-xl p-6 shadow-pop">
            <h2
              id="register-confirm-title"
              className="text-sm font-semibold text-ink"
            >
              确认注册
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              账号“{pendingUsername}”将立即创建，确认后无需再次输入密码。
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="zouzou-secondary-button inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmRegistration}
                className="zouzou-primary-button inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                确认注册
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
