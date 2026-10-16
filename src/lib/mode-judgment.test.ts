import { test } from "node:test";
import assert from "node:assert/strict";
import { pickModeFromJudgment } from "@/lib/mode-judgment";
import { heuristicProjectMode } from "@/lib/work-mode";

/**
 * 回归：extractJson 只取第一个平衡的 {...}，模型返回数组 [{...}] 时会被剥成单对象。
 * 之前只判数组，导致模型判对了 mode 也掉进兜底 normal（实测三条全变 normal）。
 */
test("模式判断的返回：数组和单对象都要能解析", () => {
  assert.equal(
    pickModeFromJudgment('[{"id":"current","mode":"longterm","confidence":0.9}]'),
    "longterm",
  );
  assert.equal(pickModeFromJudgment('{"id":"current","mode":"explore"}'), "explore");
  assert.equal(
    pickModeFromJudgment('```json\n[{"id":"current","mode":"normal"}]\n```'),
    "normal",
  );
});

test("模式判断的返回：脏输入一律回落到 normal", () => {
  assert.equal(pickModeFromJudgment(null), "normal");
  assert.equal(pickModeFromJudgment(""), "normal");
  assert.equal(pickModeFromJudgment("这不是 JSON"), "normal");
  assert.equal(pickModeFromJudgment('[{"mode":"乱值"}]'), "normal");
});

test("本地兜底不会把持续目标压成一次性任务", () => {
  assert.equal(
    heuristicProjectMode("想学手工，但一直没做出第一件作品", false),
    "explore",
  );
  assert.equal(heuristicProjectMode("想养成每天读书的习惯", false), "explore");
  assert.equal(heuristicProjectMode("想把英语练起来", false), "explore");
  assert.equal(heuristicProjectMode("三周内交一份小组作业", false), "longterm");
  assert.equal(heuristicProjectMode("整理一下书桌", false), "normal");
});

test("探索门槛提高：一次性的探路动作不算探索", () => {
  assert.equal(heuristicProjectMode("想试试做自媒体，先看看有没有人看", false), "normal");
  assert.equal(heuristicProjectMode("调研一下要不要换工作", false), "normal");
  assert.equal(heuristicProjectMode("了解下这个行业现在什么情况", false), "normal");
  assert.equal(heuristicProjectMode("想长期保持跑步习惯", false), "explore");
  assert.equal(heuristicProjectMode("每天跑步，坚持三个月", false), "longterm");
});
