import { test } from "node:test";
import assert from "node:assert/strict";
import {
  endOfDay,
  formatDate,
  isSameDay,
  startOfDay,
  toDateInputValue,
} from "@/lib/date";

test("startOfDay 归零到当天 00:00:00.000", () => {
  const result = startOfDay(new Date(2026, 8, 17, 15, 42, 7, 512));
  assert.equal(result.getHours(), 0);
  assert.equal(result.getMinutes(), 0);
  assert.equal(result.getSeconds(), 0);
  assert.equal(result.getMilliseconds(), 0);
  assert.equal(result.getDate(), 17);
});

test("startOfDay 不修改传入的日期对象", () => {
  const source = new Date(2026, 8, 17, 15, 42);
  startOfDay(source);
  assert.equal(source.getHours(), 15);
});

test("endOfDay 推到当天 23:59:59.999", () => {
  const result = endOfDay(new Date(2026, 8, 17, 0, 0, 0, 0));
  assert.equal(result.getHours(), 23);
  assert.equal(result.getMinutes(), 59);
  assert.equal(result.getSeconds(), 59);
  assert.equal(result.getMilliseconds(), 999);
});

test("isSameDay 只看年月日", () => {
  const morning = new Date(2026, 8, 17, 0, 0, 1);
  const night = new Date(2026, 8, 17, 23, 59, 59);
  const nextDay = new Date(2026, 8, 18, 0, 0, 1);

  assert.equal(isSameDay(morning, night), true);
  assert.equal(isSameDay(morning, nextDay), false);
});

test("toDateInputValue 输出本地 YYYY-MM-DD，且补零", () => {
  assert.equal(toDateInputValue(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(toDateInputValue(new Date(2026, 11, 31)), "2026-12-31");
});

test("toDateInputValue 对空值返回空字符串", () => {
  assert.equal(toDateInputValue(null), "");
  assert.equal(toDateInputValue(undefined), "");
});

test("formatDate 返回中文短日期", () => {
  const text = formatDate(new Date(2026, 8, 17));
  assert.ok(text.includes("17"), `实际输出：${text}`);
  assert.ok(text.includes("9月"), `实际输出：${text}`);
});
