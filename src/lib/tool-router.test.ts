import { test } from "node:test";
import assert from "node:assert/strict";
import { routeTool, toolKindLabel } from "@/lib/tool-router";

/**
 * 这一组盯的是安全边界：写操作绝不能被路由成"可以直接做"。
 * tool-router.ts 文件顶部的注释写明了意图 —— 避免模型自己去登录、注册、下单。
 */
const WRITE_CASES = [
  "发布一篇公众号文章",
  "帮我注册一个账号",
  "下单买这个键盘",
  "给客户回复邮件",
  "在论坛投稿这篇文章",
  "申请这个岗位并提交表单",
  "在购物网站支付这笔订单",
  "注销这个不用的账号",
  "退订这个邮件列表",
];

for (const input of WRITE_CASES) {
  test(`写操作必须要求确认：${input}`, () => {
    const decision = routeTool(input);
    assert.equal(
      decision.policy,
      "confirm-write",
      `"${input}" 应被识别为写操作，实际得到 ${decision.policy}（${decision.reason}）`,
    );
  });
}

const READ_CASES: Array<[string, string]> = [
  ["读完 https://example.com/post 告诉我重点", "read"],
  ["这篇文章讲了什么", "read"],
  ["看下这个网页里的结论", "read"],
];

for (const [input, kind] of READ_CASES) {
  test(`只读读取：${input}`, () => {
    const decision = routeTool(input);
    assert.equal(decision.kind, kind);
    assert.equal(decision.policy, "read");
  });
}

test("代码仓库走 github 通道", () => {
  const decision = routeTool("看看这个仓库最近的提交");
  assert.equal(decision.kind, "github");
  assert.equal(decision.policy, "read");
});

test("API 与官方文档走 docs 通道", () => {
  const decision = routeTool("Next.js App Router 的 API 文档怎么写");
  assert.equal(decision.kind, "docs");
  assert.equal(decision.policy, "read");
});

test("依赖最新信息的判断才联网搜索", () => {
  assert.equal(routeTool("今年新能源车有什么新政策").kind, "search");
  assert.equal(routeTool("现在几个主流笔记软件的价格").kind, "search");
});

test("不依赖外部信息的任务不联网", () => {
  assert.equal(routeTool("把简历里三个项目讲清楚").policy, "none");
  assert.equal(routeTool("整理这周的会议记录").policy, "none");
});

test("空输入不联网", () => {
  const decision = routeTool("   ");
  assert.equal(decision.policy, "none");
  assert.equal(decision.kind, "none");
});

test("工具名有中文标签", () => {
  assert.equal(toolKindLabel("search"), "联网搜索");
  assert.equal(toolKindLabel("github"), "查看仓库");
  assert.equal(toolKindLabel("none"), "不需要联网");
});
