"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Sparkles } from "lucide-react";

const KEY_STORAGE = "ai-api-key";

export function AiSettings({
  serverConnected = false,
}: {
  serverConnected?: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const hasLocalKey = Boolean(apiKey);
  const connected = hasLocalKey || serverConnected;

  useEffect(() => {
    function readStorage() {
      setApiKey(localStorage.getItem(KEY_STORAGE) ?? "");
    }

    function onKeyUpdated() {
      setApiKey(localStorage.getItem(KEY_STORAGE) ?? "");
    }

    const timer = window.setTimeout(readStorage, 0);
    window.addEventListener("ai-key-updated", onKeyUpdated);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ai-key-updated", onKeyUpdated);
    };
  }, []);

  function save() {
    const key = apiKey.trim();
    if (key) {
      localStorage.setItem(KEY_STORAGE, key);
      localStorage.removeItem("ai-model");
      localStorage.removeItem("ai-base-url");
    } else {
      localStorage.removeItem(KEY_STORAGE);
      localStorage.removeItem("ai-model");
      localStorage.removeItem("ai-base-url");
    }
    setApiKey(key);
    window.dispatchEvent(new Event("ai-key-updated"));
  }

  return (
    <details className="zouzou-panel rounded-xl bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-accent">
        <span className="flex items-center gap-1.5">
          <KeyRound className="size-3.5" />
          API 连接
        </span>
        <span
          className={
            connected
              ? "inline-flex items-center gap-1 text-success"
              : "inline-flex items-center gap-1 text-warning"
          }
        >
          {connected ? (
            <>
              <CheckCircle2 className="size-3.5" />
              {hasLocalKey ? "已连接" : "服务端已连接"}
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              本地规则
            </>
          )}
        </span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
            DeepSeek API Key
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            className="zouzou-input w-full rounded-lg px-3 py-2 text-sm text-ink"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] leading-4 text-ink-muted">
            {serverConnected && !hasLocalKey
              ? "当前使用服务端连接，也可在本机覆盖。"
              : "Key 只保存在本机浏览器，用于当前 AI 请求。"}
          </p>
          <button
            type="button"
            onClick={save}
            className="zouzou-primary-button inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
          >
            保存
          </button>
        </div>
      </div>
    </details>
  );
}
