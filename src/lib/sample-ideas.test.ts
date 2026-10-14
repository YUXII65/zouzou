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
 * 每条示例由「外面展示的 title」和「点击后填入的 content」组成，两者都要经得起看。
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

test("完整正文之间没有重复", () => {
  const seen = new Map<string, number>();
  for (const idea of sampleIdeas) {
    seen.set(idea.content, (seen.get(idea.content) ?? 0) + 1);
  }
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicated, [], `发现重复正文：${JSON.stringify(duplicated)}`);
});

test("外面展示的标题之间没有重复", () => {
  const seen = new Map<string, number>();
  for (const idea of sampleIdeas) {
    seen.set(idea.title, (seen.get(idea.title) ?? 0) + 1);
  }
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicated, [], `发现重复标题：${JSON.stringify(duplicated)}`);
});

test("正文和标题都没有占位式表达", () => {
  const offenders = sampleIdeas.filter((idea) =>
    PLACEHOLDER_PATTERNS.some(
      (pattern) => idea.content.includes(pattern) || idea.title.includes(pattern),
    ),
  );
  assert.deepEqual(
    offenders,
    [],
    `发现占位表达：${offenders.map((idea) => idea.title).join(" / ")}`,
  );
});

test("正文都有具体的对象和处境，不是空壳句子", () => {
  const tooShort = sampleIdeas.filter((idea) => idea.content.trim().length < 20);
  assert.deepEqual(
    tooShort,
    [],
    `过短的正文：${tooShort.map((idea) => idea.title).join(" / ")}`,
  );
});

test("标题是一眼能扫过的精简小结", () => {
  const bad = sampleIdeas.filter((idea) => {
    const length = idea.title.trim().length;
    return length < 6 || length > 26;
  });
  assert.deepEqual(
    bad,
    [],
    `标题长度不合适的示例：${bad.map((idea) => idea.title).join(" / ")}`,
  );
});

test("正文和标题都不首尾留白", () => {
  const untrimmed = sampleIdeas.filter(
    (idea) =>
      idea.content !== idea.content.trim() || idea.title !== idea.title.trim(),
  );
  assert.deepEqual(untrimmed, []);
});

test("pickRandomSampleIdeas 取够数量且都来自示例池", () => {
  const picked = pickRandomSampleIdeas(3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3, "同一次抽选不应重复");
  for (const idea of picked) {
    assert.ok(sampleIdeas.includes(idea), `抽到了池外内容：${idea.title}`);
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
  assert.ok(
    picked.every(
      (idea) =>
        typeof idea.title === "string" &&
        idea.title.length > 0 &&
        idea.content.length > 0,
    ),
  );
});