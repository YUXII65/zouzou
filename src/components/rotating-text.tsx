"use client";

import { useEffect, useState } from "react";

export function useRotatingText(
  active: boolean,
  messages: string[],
  intervalMs = 1400,
) {
  const [index, setIndex] = useState(0);
  const messageKey = messages.join("\u0000");

  useEffect(() => {
    if (!active || messages.length <= 1) {
      setIndex(0);
      return;
    }

    setIndex(0);
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, messageKey, messages.length]);

  return messages[index] ?? messages[0] ?? "";
}

