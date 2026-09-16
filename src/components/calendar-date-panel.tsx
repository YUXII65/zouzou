import { CurrentTime } from "@/components/current-time";
import { Flame } from "lucide-react";

export function CalendarDatePanel({
  now,
  completedToday,
  totalToday,
  streak,
  weekDone,
}: {
  now: Date;
  completedToday: number;
  totalToday: number;
  streak: number;
  weekDone: number;
}) {
  const progress = totalToday
    ? Math.round((completedToday / totalToday) * 100)
    : 0;
  const remaining = Math.max(totalToday - completedToday, 0);
  const weekday = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ][now.getDay()];
  const initialTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <section className="zouzou-panel mb-5 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-end gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-semibold leading-none tabular-nums text-ink">
              {String(now.getDate()).padStart(2, "0")}
            </span>
            <span className="text-sm font-medium tabular-nums text-ink-secondary">
              {now.getMonth() + 1}月 {weekday}
            </span>
          </div>

          <div className="text-2xl font-semibold leading-none tabular-nums text-ink">
            <CurrentTime initial={initialTime} />
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="w-32">
            <div className="flex items-center justify-between text-xs text-ink-secondary">
              <span>今日</span>
              <span>
                {completedToday} / {totalToday}
                {remaining ? `，还剩 ${remaining}` : "，全部完成"}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-warning/10 px-3 text-xs font-medium text-warning">
            <Flame className="size-3.5" />
            连续 {streak} 天
            {weekDone > 0 ? (
              <span className="text-ink-muted">· 近 7 天 {weekDone} 件</span>
            ) : null}
          </span>
        </div>
      </div>
    </section>
  );
}
