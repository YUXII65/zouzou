"use client";

import { claimGuestAccount } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const inputClass =
  "zouzou-input mt-3 w-full rounded-lg px-3 py-2 text-sm text-ink";
const submitClass =
  "zouzou-primary-button mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong";

export function GuestRegisterCard({ error }: { error: string }) {
  return (
    <form
      action={claimGuestAccount}
      className="zouzou-panel rounded-xl p-6 sm:p-7"
    >
      <input type="hidden" name="next" value="/" />
      <h2 className="text-sm font-semibold text-ink">注册账号</h2>
      <p className="mt-2 text-sm leading-6 text-ink-secondary">
        注册后，这次体验里的项目和任务会继续保留。
      </p>
      <input
        name="username"
        required
        minLength={2}
        maxLength={20}
        autoComplete="username"
        placeholder="用户名"
        className={inputClass}
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
      {error === "register" ? (
        <p className="mt-3 text-sm text-danger">
          注册失败，请检查用户名和密码，或账号可能已存在。
        </p>
      ) : null}
      <SubmitButton className={submitClass}>注册并继续</SubmitButton>
    </form>
  );
}
