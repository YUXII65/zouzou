"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

function formatReviewDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  const date = new Date(year, month - 1, day);
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
  }).format(date);
  return `${monthDay}　${weekday}`;
}

export function ReviewDateField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
        日期
      </span>
      <span className="relative block">
        <input
          type="date"
          name="reviewDate"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="复盘日期"
          className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        />
        <span className="zouzou-input flex h-10 items-center justify-between rounded-lg px-3 text-sm text-ink">
          {formatReviewDate(value)}
          <CalendarDays className="size-4 text-ink-muted" />
        </span>
      </span>
    </label>
  );
}
