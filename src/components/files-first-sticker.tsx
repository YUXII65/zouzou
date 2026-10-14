"use client";

import { useEffect, useState } from "react";
import { AnchoredHint } from "@/components/anchored-hint";
import { TOUR_TARGETS } from "@/lib/tour";

const STORAGE_KEY = "next_step_sticker_files_first";

export function FilesFirstSticker({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      // Ignore storage errors and show for this session.
    }
    setVisible(true);
  }, [enabled]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <AnchoredHint
      target={TOUR_TARGETS.nextButton}
      title="开始推进任务"
      onDismiss={dismiss}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
          >
            好的
          </button>
        </div>
      }
    >
      点击待办，去完成给出的任务
    </AnchoredHint>
  );
}