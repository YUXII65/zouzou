"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Circle,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  addCheckinItems,
  createCheckinProject,
  deleteCheckinProject,
  toggleCheckinItem,
} from "@/app/actions";
import type { CheckinProjectSummary } from "@/lib/checkin";
import { cx } from "@/lib/utils";

type CheckinDraftItem = {
  id: string;
  label: number | null;
  value: string;
  added: boolean;
};

function useEscape(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, onClose]);
}

export function CheckinModeButton({
  checkin,
}: {
  checkin: CheckinProjectSummary | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [draftItems, setDraftItems] = useState<CheckinDraftItem[]>(() =>
    [1, 2, 3].map((label) => ({
      id: `default-${label}`,
      label,
      value: "",
      added: false,
    })),
  );
  const nextDraftId = useRef(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEscape(open, () => setOpen(false));
  useEscape(cancelOpen, () => setCancelOpen(false));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set(
        "items",
        draftItems.map((item) => item.value).join("\n"),
      );
      const result = await createCheckinProject(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setDraftItems(
        [1, 2, 3].map((label) => ({
          id: `default-${label}`,
          label,
          value: "",
          added: false,
        })),
      );
      router.push(`/files?project=${result.projectId}`);
      router.refresh();
    } catch {
      setError("没保存上，再试一次。");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!checkin || cancelSaving) return;
    setCancelSaving(true);
    try {
      const formData = new FormData();
      formData.set("projectId", checkin.projectId);
      const result = await deleteCheckinProject(formData);
      if (result.ok) {
        setCancelOpen(false);
        router.refresh();
      }
    } finally {
      setCancelSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={
          checkin
            ? `打卡模式，第 ${checkin.dayNumber} 天，点击取消打卡`
            : "开启打卡模式"
        }
        onClick={() => {
          if (checkin) {
            setCancelOpen(true);
            return;
          }
          setError("");
          setOpen(true);
        }}
        className={cx(
          "inline-flex h-10 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border px-2 text-left text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:text-sm",
          checkin
            ? "border-mode-checkin/35 bg-mode-checkin-soft/70 text-mode-checkin-ink hover:bg-mode-checkin-soft"
            : "border-border bg-surface/70 text-ink-secondary hover:border-mode-checkin/35 hover:text-mode-checkin-ink",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <ListChecks className="size-3.5 shrink-0 sm:size-4" />
          <span className="truncate">打卡模式</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] sm:text-xs">
          {checkin ? (
            <>
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>第 {checkin.dayNumber} 天</span>
            </>
          ) : (
            "开启"
          )}
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => !saving && setOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-setup-title"
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-pop"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="checkin-setup-title"
                  className="text-lg font-semibold text-ink"
                >
                  开启打卡模式
                </h2>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  监督待办，培养习惯
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                aria-label="关闭"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={submit} className="mt-4">
              <div className="space-y-2">
                {draftItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      value={item.value}
                      autoFocus={index === 0}
                      maxLength={80}
                      aria-label={`打卡待办 ${index + 1}`}
                      placeholder={
                        item.added ? "添加" : `待办 ${item.label}`
                      }
                      onChange={(event) =>
                        setDraftItems((current) =>
                          current.map((draft) =>
                            draft.id === item.id
                              ? { ...draft, value: event.target.value }
                              : draft,
                          ),
                        )
                      }
                      className="zouzou-input h-10 min-w-0 flex-1 px-3 text-sm"
                    />
                    {item.value.trim() || item.added ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftItems((current) =>
                            current.filter((draft) => draft.id !== item.id),
                          )
                        }
                        className="h-8 shrink-0 rounded-md px-2 text-xs font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
                      >
                        取消
                      </button>
                    ) : null}
                  </div>
                ))}
                {draftItems.length < 30 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const id = nextDraftId.current;
                      nextDraftId.current += 1;
                      setDraftItems((current) => [
                        ...current,
                        {
                          id: `added-${id}`,
                          label: null,
                          value: "",
                          added: true,
                        },
                      ]);
                    }}
                    aria-label="添加一条"
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-mode-checkin/20 bg-mode-checkin-soft/45 text-mode-checkin-ink transition-colors hover:bg-mode-checkin-soft"
                  >
                    <Plus className="size-4" />
                  </button>
                ) : null}
              </div>
              {error ? (
                <p className="mt-2 text-xs text-danger">{error}</p>
              ) : null}
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="h-9 rounded-lg px-3 text-xs font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    !draftItems.some((item) => Boolean(item.value.trim()))
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-mode-checkin px-4 text-xs font-semibold text-white hover:bg-mode-checkin-ink disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  确认开启
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {cancelOpen && checkin ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => !cancelSaving && setCancelOpen(false)}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="checkin-cancel-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-pop"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <h2
                id="checkin-cancel-title"
                className="text-lg font-semibold text-ink"
              >
                取消打卡模式？
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                打卡条目和每日完成记录会一起删除，之后可以重新开启。
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                disabled={cancelSaving}
                className="h-9 rounded-lg px-3 text-xs font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                先保留
              </button>
              <button
                type="button"
                onClick={() => void confirmCancel()}
                disabled={cancelSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-semibold text-white hover:bg-danger/85 disabled:opacity-60"
              >
                {cancelSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                确认取消
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function CheckinItemToggle({
  taskId,
  title,
  completed,
}: {
  taskId: string;
  title: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(completed);
  const [saving, setSaving] = useState(false);

  useEffect(() => setChecked(completed), [completed]);

  async function toggle() {
    if (saving) return;
    const previous = checked;
    setChecked(!previous);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("taskId", taskId);
      const result = await toggleCheckinItem(formData);
      if (!result.ok) {
        setChecked(previous);
        return;
      }
      router.refresh();
    } catch {
      setChecked(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={saving}
      aria-pressed={checked}
      aria-label={`${title}：${checked ? "今日已完成，点击撤销" : "标记今日完成"}`}
      className={cx(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
        checked
          ? "border-mode-checkin/20 bg-mode-checkin-soft/65 text-mode-checkin-ink"
          : "border-mode-checkin/25 bg-surface text-ink hover:bg-mode-checkin-soft/35",
      )}
    >
      {saving ? (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      ) : checked ? (
        <CheckCircle2 className="size-4 shrink-0" />
      ) : (
        <Circle className="size-4 shrink-0 text-mode-checkin/70" />
      )}
      <span className={cx("min-w-0", checked && "line-through opacity-75")}>
        {title}
      </span>
    </button>
  );
}

export function CheckinEntryForm({
  projectId,
  compact = false,
}: {
  projectId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !items.trim()) return;
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("items", items);
      const result = await addCheckinItems(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("没加上，再试一次。");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "inline-flex items-center gap-1.5 text-xs font-medium text-mode-checkin-ink transition-colors hover:text-mode-checkin",
          compact ? "h-8" : "h-8 px-1",
        )}
      >
        <Plus className="size-3.5" />
        补充条目
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={cx(
        "rounded-xl border border-mode-checkin/25 bg-mode-checkin-soft/45 p-3",
        compact ? "mt-2" : "",
      )}
    >
      <textarea
        value={items}
        onChange={(event) => setItems(event.target.value)}
        rows={compact ? 2 : 3}
        maxLength={3000}
        autoFocus
        placeholder="每行写一项"
        className="zouzou-input resize-y px-2.5 py-2 text-xs leading-5"
      />
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          disabled={saving}
          className="h-8 rounded-md px-2 text-xs text-ink-muted hover:bg-surface hover:text-ink"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={saving || !items.trim()}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-mode-checkin px-3 text-xs font-semibold text-white hover:bg-mode-checkin-ink disabled:opacity-55"
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : null}
          加上
        </button>
      </div>
    </form>
  );
}
