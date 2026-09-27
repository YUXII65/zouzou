"use client";

import { useEffect, useState } from "react";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function format(date: Date, hour12: boolean) {
  const hours = date.getHours();
  const minutes = pad(date.getMinutes());
  if (!hour12) return `${pad(hours)}:${minutes}`;
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

export function CurrentTime({
  initial,
  className = "",
}: {
  /** 服务端渲染时的时刻，用来避免首帧水合不一致 */
  initial: string;
  className?: string;
}) {
  const [current, setCurrent] = useState<Date | null>(null);
  const [hour12, setHour12] = useState(false);

  useEffect(() => {
    setCurrent(new Date());
    const timer = window.setInterval(() => setCurrent(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem("next_step_hour12") === "1") setHour12(true);
    } catch {
      // 读不到就按 24 小时制显示
    }
  }, []);

  function toggle() {
    setHour12((value) => {
      const next = !value;
      try {
        localStorage.setItem("next_step_hour12", next ? "1" : "0");
      } catch {
        // 存不进去也不影响这次切换
      }
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="点击切换 12 / 24 小时制"
      aria-label="点击切换 12 或 24 小时制"
      className={`tabular-nums transition-colors hover:text-accent ${className}`.trim()}
    >
      {current ? format(current, hour12) : initial}
    </button>
  );
}
