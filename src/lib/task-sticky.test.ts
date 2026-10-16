import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStickySteps, stripStickyStepPrefix } from "@/lib/task-sticky";

test("便利贴步骤统一去掉常见编号前缀", () => {
  assert.equal(stripStickyStepPrefix("1. 打开页面"), "打开页面");
  assert.equal(stripStickyStepPrefix("2、选择模板"), "选择模板");
  assert.equal(stripStickyStepPrefix("第一步：填名字"), "填名字");
  assert.equal(stripStickyStepPrefix("① 上传图片"), "上传图片");
  assert.equal(stripStickyStepPrefix("一、保存链接"), "保存链接");
  assert.equal(stripStickyStepPrefix("1 在电脑上打开简历"), "在电脑上打开简历");
});

test("便利贴步骤保留正常的数字内容", () => {
  assert.deepEqual(
    normalizeStickySteps({
      steps: ["3 个作品各写一句说明", "1. 打开 Carrd"],
      nextStep: "保存",
    }),
    ["3 个作品各写一句说明", "打开 Carrd"],
  );
});

test("便利贴没有 steps 时使用 nextStep", () => {
  assert.deepEqual(
    normalizeStickySteps({ steps: [], nextStep: "保存链接" }),
    ["保存链接"],
  );
});
