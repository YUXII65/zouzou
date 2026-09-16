"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { getUserPreferences, saveUserPreferences } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const AI_QUESTION_KEY = "next_step_ai_question_asked";
const AI_PREF_HINT_KEY = "next_step_ai_pref_hint_dismissed";

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2 text-sm text-ink";

export function AiPreferences() {
  const [values, setValues] = useState({
    plan_scale: "balanced",
    default_start_action: "smallest",
    avoid_overdue: "yes",
    project_focus: "",
  });
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [loadFailed, setLoadFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    void getUserPreferences()
      .then((preferences) => {
        if (!mounted) return;
        setValues((current) => {
          const next = { ...current };
          for (const preference of preferences) {
            if (preference.key in next) {
              next[preference.key as keyof typeof next] = preference.value;
            }
          }
          return next;
        });
      })
      .catch(() => {
        if (mounted) setLoadFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let shouldShow = false;

    try {
      const isNewUser = localStorage.getItem("next_step_new_user") === "1";
      const asked = localStorage.getItem(AI_QUESTION_KEY) === "1";
      const dismissed = localStorage.getItem(AI_PREF_HINT_KEY) === "1";
      shouldShow = isNewUser && asked && !dismissed;
    } catch {
      // Ignore storage errors and skip the hint.
    }

    if (shouldShow) setShowHint(true);
  }, []);

  useEffect(() => {
    if (!showHint) return;

    function onPointerDown(event: PointerEvent) {
      if (hintRef.current && !hintRef.current.contains(event.target as Node)) {
        dismissHint();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showHint]);

  function update(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaveState("saving");
    try {
      await saveUserPreferences(formData);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function dismissHint() {
    setShowHint(false);
    try {
      localStorage.setItem(AI_PREF_HINT_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
  }

  return (
    <div className="relative">
      <form
        onSubmit={handleSubmit}
        className="zouzou-panel space-y-3 rounded-xl bg-surface p-3"
      >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
              计划规模
            </span>
            <select
              name="plan_scale"
              value={values.plan_scale}
              onChange={(event) => update("plan_scale", event.target.value)}
              className={inputClass}
            >
              <option value="few">少而稳</option>
              <option value="balanced">适中</option>
              <option value="ambitious">可以多排</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
              默认第一步
            </span>
            <select
              name="default_start_action"
              value={values.default_start_action}
              onChange={(event) =>
                update("default_start_action", event.target.value)
              }
              className={inputClass}
            >
              <option value="smallest">具体动作</option>
              <option value="research">先研究再动手</option>
              <option value="complete">完整方案</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
              是否优先避免逾期
            </span>
            <select
              name="avoid_overdue"
              value={values.avoid_overdue}
              onChange={(event) => update("avoid_overdue", event.target.value)}
              className={inputClass}
            >
              <option value="yes">尽量不逾期</option>
              <option value="no">按节奏推进</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
              当前重点项目
            </span>
            <input
              name="project_focus"
              value={values.project_focus}
              onChange={(event) => update("project_focus", event.target.value)}
              placeholder="例如：先做最小版本"
              className={inputClass}
            />
          </label>

          {loadFailed ? (
            <p className="text-xs text-danger">
              偏好加载失败，请刷新页面后重试。
            </p>
          ) : null}
          {saveState === "saving" ? (
            <p className="text-xs text-ink-muted">保存中...</p>
          ) : saveState === "saved" ? (
            <p className="text-xs text-success">已保存</p>
          ) : saveState === "error" ? (
            <p className="text-xs text-danger">保存失败，请刷新页面后重试。</p>
          ) : null}

          <div className="flex justify-end">
            <SubmitButton
              disabled={saveState === "saving"}
              pendingText="保存中..."
              className="zouzou-primary-button inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
            >
              保存偏好
            </SubmitButton>
          </div>
      </form>

      {showHint ? (
        <div
          ref={hintRef}
          role="note"
          className="zouzou-panel absolute left-0 top-0 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl p-3 shadow-pop animate-[zouzou-fade-in_240ms_ease-out]"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-ink">
              先告诉 AI 你的偏好
            </p>
            <button
              type="button"
              onClick={dismissHint}
              aria-label="关闭提示"
              title="关闭提示"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-secondary">
            下一次整理前，把计划规模和默认第一步调成你喜欢的，结果会更准。
          </p>
        </div>
      ) : null}
    </div>
  );
}
