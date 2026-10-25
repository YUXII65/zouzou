import test from "node:test";
import assert from "node:assert/strict";
import {
  checkinDateKey,
  checkinDayNumber,
  MAX_CHECKIN_ITEMS_PER_WRITE,
  parseCheckinItems,
} from "@/lib/checkin";
import { PROJECT_MODES } from "@/lib/work-mode";

test("打卡按上海时区切换日期", () => {
  assert.equal(
    checkinDateKey(new Date("2026-10-24T15:59:59.000Z")),
    "2026-10-24",
  );
  assert.equal(
    checkinDateKey(new Date("2026-10-24T16:00:00.000Z")),
    "2026-10-25",
  );
});

test("打卡天数按上海日期计算，创建当天为第 1 天", () => {
  const createdAt = new Date("2026-10-20T03:00:00.000Z");
  assert.equal(checkinDayNumber(createdAt, new Date("2026-10-20T15:00:00.000Z")), 1);
  assert.equal(checkinDayNumber(createdAt, new Date("2026-10-21T15:00:00.000Z")), 2);
});

test("打卡条目按行清理、去重并限制长度", () => {
  const items = parseCheckinItems(
    " 喝水 \n\n喝水\n拉伸 20 分钟\n" + "很长的条目".repeat(30),
  );
  assert.deepEqual(items.slice(0, 2), ["喝水", "拉伸 20 分钟"]);
  assert.equal(items[2].length, 80);
});

test("单次补充最多保留三十项", () => {
  const items = parseCheckinItems(
    Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 项`).join("\n"),
  );
  assert.equal(items.length, MAX_CHECKIN_ITEMS_PER_WRITE);
});

test("按模式排序时打卡固定置顶", () => {
  assert.equal(PROJECT_MODES[0], "checkin");
});
