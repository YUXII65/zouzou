"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { submitProductFeedback } from "@/app/actions";

export function ProductFeedback() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 4000);
    return () => window.clearTimeout(timer);
  }, [sent]);

  function close() {
    setOpen(false);
    setMessage("");
    setError("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || pending) return;

    const formData = new FormData();
    formData.set("message", value);
    formData.set("page", pathname);
    setError("");

    startTransition(async () => {
      const result = await submitProductFeedback(formData);
      if (!result.ok) {
        setError(result.error ?? "没送出去，再试一次");
        return;
      }
      setMessage("");
      setSent(true);
      setOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setSent(false);
          setError("");
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-accent"
      >
        <MessageSquarePlus className="size-3.5" />
        {sent ? "已收到，谢谢" : "有改进意见？十分感谢！"}
      </button>

      {open ? (
        <form
          onSubmit={handleSubmit}
          className="zouzou-panel absolute bottom-full right-0 z-50 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl p-3 shadow-pop"
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
            }}
            rows={3}
            maxLength={1200}
            placeholder="哪一句、哪一步让你觉得别扭？"
            className="zouzou-input resize-none px-3 py-2 text-sm leading-5"
          />
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={close}
              className="text-xs text-ink-muted transition-colors hover:text-ink"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!message.trim() || pending}
              className="zouzou-primary-button inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "正在送出" : "送出"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}