import { test } from "node:test";
import assert from "node:assert/strict";
import { assessIdeaReadiness } from "@/lib/idea-readiness";

test("只有抽象任务和不知道干什么时，判为需要澄清真实需求", () => {
  const result = assessIdeaReadiness("我做一个任务。我有一个计划。我不知道干什么。");
  assert.equal(result.readiness, "needs_meaning");
  assert.deepEqual(result.missingSlots, ["具体对象", "真正想改变的结果"]);
  assert.ok(result.completionOptions.length >= 2);
});

test("有抽象对象但没有具体落点时，判为需要补上下文", () => {
  const result = assessIdeaReadiness("我有一个计划");
  assert.equal(result.readiness, "needs_context");
  assert.ok(result.completionPrompt.includes("具体指什么"));
});

test("有具体对象和行动时，可以直接进入关键取舍澄清", () => {
  const result = assessIdeaReadiness(
    "我想做一个个人网站，可能是作品集也可能是博客，但想先做出一个能展示的作品。",
  );
  assert.equal(result.readiness, "ready");
  assert.deepEqual(result.missingSlots, []);
});

test("具体对象加元问题不会被误判成凭空规划", () => {
  const result = assessIdeaReadiness("我准备了论文开题，但不知道从哪开始。");
  assert.equal(result.readiness, "ready");
});
