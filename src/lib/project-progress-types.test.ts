import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPreparedExploreContinuation,
  parseExploreContinuation,
} from "@/lib/project-progress-types";

const valid = JSON.stringify({
  decision: "continue",
  trackName: "基础手型",
  trackRole: "main",
  newTrackIntent: null,
  currentMilestone: "能稳定换和弦",
  reason: "上一轮已经能按实 C 和弦",
  task: {
    title: "录一段 30 秒换和弦视频",
    shortTitle: "录换和弦视频",
  },
  source: "model",
});

test("探索下一条任务预览可以被解析并消费", () => {
  const parsed = parseExploreContinuation(valid);
  assert.equal(parsed?.decision, "continue");
  assert.equal(parsed?.task?.title, "录一段 30 秒换和弦视频");
  assert.equal(hasPreparedExploreContinuation(valid), true);
});

test("探索下一条任务预览格式损坏时不能冒充已准备好", () => {
  assert.equal(parseExploreContinuation("{"), null);
  assert.equal(parseExploreContinuation(JSON.stringify({ decision: "continue" })), null);
  assert.equal(hasPreparedExploreContinuation(null), false);
});
