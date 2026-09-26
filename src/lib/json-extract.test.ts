import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject } from "@/lib/json-extract";

test("提取纯 JSON 对象", () => {
  assert.equal(extractJsonObject('{"a":1}'), '{"a":1}');
});

test("忽略 JSON 前后的说明文字", () => {
  const text = '好的，结果如下：\n{"a":1}\n希望有帮助。';
  assert.equal(extractJsonObject(text), '{"a":1}');
});

test("JSON 后面还有带花括号的解释时，只取第一个平衡对象", () => {
  const text = '{"a":1}\n补充说明：这里的 {b} 只是示例。';
  assert.equal(extractJsonObject(text), '{"a":1}');
});

test("嵌套对象要取到最外层", () => {
  const text = 'prefix {"a":{"b":{"c":1}},"d":2} suffix {x}';
  assert.equal(extractJsonObject(text), '{"a":{"b":{"c":1}},"d":2}');
});

test("字符串里的花括号不算结构", () => {
  const text = '{"a":"里 { 面 } 有括号","b":1} 尾巴';
  assert.equal(extractJsonObject(text), '{"a":"里 { 面 } 有括号","b":1}');
});

test("没有 JSON 返回 null", () => {
  assert.equal(extractJsonObject("没有对象"), null);
  assert.equal(extractJsonObject(""), null);
  assert.equal(extractJsonObject(null), null);
});

test("只有半个对象返回 null", () => {
  assert.equal(extractJsonObject('{"a":1'), null);
});
