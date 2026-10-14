"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ChangeEvent } from "react";
import { Camera, Check, Loader2, Pencil, X } from "lucide-react";
import { updateUserProfile } from "@/app/actions";
import { PROJECT_MODE_META, type ProjectMode } from "@/lib/work-mode";
import { cx } from "@/lib/utils";

const AVATAR_PIXELS = 192;
const MAX_AVATAR_CHARS = 400_000;

export type ProfileUser = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
};

/** 把上传的图片压成 192×192 的 JPEG data URL，避免把大图塞进数据库 */
async function fileToAvatarDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");

  const scale = Math.max(
    AVATAR_PIXELS / bitmap.width,
    AVATAR_PIXELS / bitmap.height,
  );
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(
    bitmap,
    (AVATAR_PIXELS - width) / 2,
    (AVATAR_PIXELS - height) / 2,
    width,
    height,
  );
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * 个人页的名片。
 * v3.4 起左侧栏的账号入口收进这里：头像点一下就能换，昵称点铅笔就能改。
 * 只放身份信息和三个模式的推进数量；夜间模式、退出登录属于「功能」，放在名片外面的功能区。
 */
export function ProfileNameCard({
  user,
  counts,
}: {
  user: ProfileUser;
  counts: Record<ProjectMode, number>;
}) {
  const [name, setName] = useState(user.displayName ?? user.username);
  const [avatar, setAvatar] = useState(user.avatarUrl ?? "");
  const [editingName, setEditingName] = useState(false);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = user.displayName || user.username;
  const dirty =
    name.trim() !== (user.displayName ?? user.username) ||
    avatar !== (user.avatarUrl ?? "");

  useEffect(() => {
    if (!editingName) setError("");
  }, [editingName]);

  function save(next?: { name?: string; avatar?: string }) {
    setError("");
    const nextName = (next?.name ?? name).trim() || user.username;
    const nextAvatar = next?.avatar ?? avatar;
    const formData = new FormData();
    formData.set("name", nextName);
    formData.set("avatarUrl", nextAvatar);
    startSaving(async () => {
      try {
        const result = await updateUserProfile(formData);
        if (result && !result.ok) {
          setError(result.error);
          return;
        }
        setName(nextName);
        setAvatar(nextAvatar);
        setEditingName(false);
      } catch {
        setError("没保存上，再试一次。");
      }
    });
  }

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      if (dataUrl.length > MAX_AVATAR_CHARS) {
        setError("图片太大了，换一张小一点的。");
        return;
      }
      setAvatar(dataUrl);
      save({ avatar: dataUrl });
    } catch {
      setError("这张图片读不出来，换一张试试。");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-surface/70 backdrop-blur">
      <div className="flex items-center gap-4 px-6 py-6">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="更换头像"
          title="更换头像"
          className="group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-xl font-semibold text-accent-strong"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="size-full object-cover" />
          ) : (
            displayName.slice(0, 1).toUpperCase()
          )}
          <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center bg-overlay text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-3" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              value={name}
              autoFocus
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") {
                  setName(user.displayName ?? user.username);
                  setEditingName(false);
                }
              }}
              className="zouzou-input w-full rounded-lg px-3 py-2 text-lg font-semibold text-ink"
            />
          ) : (
            <h1 className="truncate text-xl font-semibold text-ink">
              {displayName}
            </h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {editingName ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setName(user.displayName ?? user.username);
                  setEditingName(false);
                }}
                aria-label="取消修改昵称"
                className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => save()}
                disabled={saving}
                aria-label="保存昵称"
                className="zouzou-primary-button flex size-8 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              aria-label="修改昵称"
              title="修改昵称"
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="px-6 pb-3 text-xs text-danger">{error}</p>
      ) : null}
      {!editingName && dirty && !saving ? (
        <p className="px-6 pb-3 text-xs text-ink-muted">
          头像已换好，正在保存。
        </p>
      ) : null}

      <div className="grid grid-cols-3 border-t border-border/60">
        {(["normal", "longterm", "explore"] as ProjectMode[]).map(
          (mode, index) => {
            const meta = PROJECT_MODE_META[mode];
            return (
              <div
                key={mode}
                className={cx(
                  "px-4 py-5 text-center",
                  index > 0 ? "border-l border-border/60" : "",
                )}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    aria-hidden
                    className={cx("size-2 rounded-full", meta.swatchClass)}
                  />
                  <span className="text-xs font-medium text-ink-secondary">
                    {meta.label}
                  </span>
                </div>
                <p
                  className={cx(
                    "mt-2 text-2xl font-semibold tabular-nums",
                    meta.textClass,
                  )}
                >
                  {counts[mode]}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">推进中</p>
              </div>
            );
          },
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
      />
    </section>
  );
}
