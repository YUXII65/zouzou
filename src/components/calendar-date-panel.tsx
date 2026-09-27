import { CurrentTime } from "@/components/current-time";

const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

export function CalendarDatePanel({ now }: { now: Date }) {
  const weekday = WEEKDAYS[now.getDay()];
  const initialTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <section className="zouzou-panel mb-5 flex items-center justify-between gap-4 px-4 py-4">
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-semibold leading-none tabular-nums text-ink">
          {String(now.getDate()).padStart(2, "0")}
        </span>
        <span className="text-sm font-medium tabular-nums text-ink-secondary">
          {now.getMonth() + 1}月 {weekday}
        </span>
      </div>

      <CurrentTime
        initial={initialTime}
        className="text-2xl font-semibold leading-none text-ink"
      />
    </section>
  );
}
