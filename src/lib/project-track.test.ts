import assert from "node:assert/strict";
import test from "node:test";
import { MAX_EXPLORE_TRACKS, readPlanTracks } from "@/lib/project-track";

test("explore 线路图：去重、限数、修掉多余的 main", () => {
  const tracks = readPlanTracks([
    { name: "基础手型", intent: "把按弦按实", role: "main" },
    { name: "基础手型", intent: "重复项应被丢掉", role: "side" },
    { name: "乐理", intent: "能看懂谱", role: "main" },
    { name: "表演", intent: "能在人前弹", role: "side" },
    { name: "录音", intent: "能录一段", role: "side" },
    { name: "第五第六第七条都应该被截掉", intent: "超限", role: "side" },
  ]);
  assert.equal(tracks.length, MAX_EXPLORE_TRACKS);
  assert.equal(tracks[0].role, "main");
  // 只允许一条主线，第二個 main 降级为支线
  assert.equal(tracks.filter((track) => track.role === "main").length, 1);
  assert.equal(tracks[1].role, "side");
  assert.equal(tracks.filter((track) => track.name === "基础手型").length, 1);
});

test("explore 线路图：占位词不会成为线路", () => {
  const tracks = readPlanTracks([
    { name: "线路名", intent: "这条线在验证什么", role: "main" },
    { name: "选题表达", intent: "验证表达是否清楚", role: "side" },
  ]);
  assert.deepEqual(tracks.map((track) => track.name), ["选题表达"]);
  assert.equal(tracks[0].role, "main");
});

test("explore 线路图：没有 main 时把第一条提为 main", () => {
  const tracks = readPlanTracks([
    { name: "手型", intent: "基础", role: "side" },
    { name: "乐理", intent: "看谱", role: "side" },
  ]);
  assert.equal(tracks[0].role, "main");
  assert.equal(tracks[1].role, "side");
});

test("explore 线路图：非数组、空数组、无名字都返回空", () => {
  assert.deepEqual(readPlanTracks(undefined), []);
  assert.deepEqual(readPlanTracks("主线"), []);
  assert.deepEqual(readPlanTracks([]), []);
  assert.deepEqual(readPlanTracks([{ intent: "没有名字", role: "main" }]), []);
});

test("explore 线路图：intent 缺失时回退到线路名", () => {
  const tracks = readPlanTracks([{ name: "手型", role: "main" }]);
  assert.equal(tracks[0].intent, "手型");
});
