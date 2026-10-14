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

export function useClickOutside<T extends HTMLElement>(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (!ref.current || ref.current.contains(target)) return;
      if (isInsideFloatingLayer(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return { ref, open, setOpen };
}
