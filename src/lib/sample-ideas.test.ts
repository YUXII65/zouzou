import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickRandomSampleIdeas,
  sampleIdeas,
  sampleIdeasForDate,
} from "@/lib/sample-ideas";

/**
 * 规则来源：AGENTS.md「首页示例扩充流程」。
 * 示例池是对外展示产品质量的地方，一旦混进占位表达或重复项，用户第一眼就会看到。
 */
const PLACEHOLDER_PATTERNS = [
  "某个",
  "某个人",
  "一件事",
  "一个方向",
  "一个想法",
  "一些事情",
];

test("示例池规模达到 100 条", () => {
  assert.ok(
    sampleIdeas.length >= 100,
    `当前只有 ${sampleIdeas.length} 条，规则要求至少 100 条`,
  );
});

test("示例之间没有重复", () => {
  const seen = new Map<string, number>();
  for (const idea of sampleIdeas) {
    seen.set(idea, (seen.get(idea) ?? 0) + 1);
  }
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicated, [], `发现重复示例：${JSON.stringify(duplicated)}`);
});

test("示例没有占位式表达", () => {
  const offenders = sampleIdeas.filter((idea) =>
    PLACEHOLDER_PATTERNS.some((pattern) => idea.includes(pattern)),
  );
  assert.deepEqual(offenders, [], `发现占位表达：${offenders.join(" / ")}`);
});

test("示例都有具体的对象和处境，不是空壳句子", () => {
  const tooShort = sampleIdeas.filter((idea) => idea.trim().length < 20);
  assert.deepEqual(tooShort, [], `过短的示例：${tooShort.join(" / ")}`);
});

test("示例不首尾留白", () => {
  const untrimmed = sampleIdeas.filter((idea) => idea !== idea.trim());
  assert.deepEqual(untrimmed, []);
});

test("pickRandomSampleIdeas 取够数量且都来自示例池", () => {
  const picked = pickRandomSampleIdeas(3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3, "同一次抽选不应重复");
  for (const idea of picked) {
    assert.ok(sampleIdeas.includes(idea), `抽到了池外内容：${idea}`);
  }
});

test("sampleIdeasForDate 每天固定，且不越界", () => {
  const first = sampleIdeasForDate(3);
  const second = sampleIdeasForDate(3);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  for (const idea of first) {
    assert.ok(sampleIdeas.includes(idea));
  }
});

test("取用数量超过池子大小时不会返回 undefined", () => {
  const picked = pickRandomSampleIdeas(sampleIdeas.length + 5);
  assert.equal(picked.length, sampleIdeas.length);
  assert.ok(picked.every((idea) => typeof idea === "string" && idea.length > 0));
});
