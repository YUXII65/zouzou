"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 挂在 body 上的浮动层（新手引导气泡等）不属于被监听容器，但它上面的点击
 * 不应被当成"点在外面"——否则 mousedown 会先把下层面板收掉，
 * 浮动层跟着被卸载，它自己的 onClick（比如关闭引导）就永远不执行。
 */
export function isInsideFloatingLayer(target: unknown) {
  if (!target || typeof target !== "object") return false;
  const node = target as { closest?: (selector: string) => unknown };
  if (typeof node.closest !== "function") return false;
  return Boolean(node.closest("[data-floating-layer]"));
}

export function isInteractiveTarget(target: unknown) {
  if (!target || typeof target !== "object") return false;
  const node = target as { closest?: (selector: string) => unknown };
  if (typeof node.closest !== "function") return false;
  return Boolean(
    node.closest(
      "button, a, input, textarea, select, summary, label, [role='button'], [role='link'], [contenteditable='true']",
    ),
  );
}

export function useClickOutside<T extends HTMLElement>(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    let closeTimer: number | null = null;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (!ref.current || ref.current.contains(target)) return;
      if (isInsideFloatingLayer(target)) return;
      if (isInteractiveTarget(target)) return;

      // 空白处没有自己的点击动作，可以立即收起。
      setOpen(false);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!ref.current || ref.current.contains(target)) return;
      if (isInsideFloatingLayer(target)) return;

      // 交互元素自己的 onClick 还没执行，先让点击完成，再收起面板。
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => setOpen(false), 0);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("touchstart", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("touchstart", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return { ref, open, setOpen };
}
