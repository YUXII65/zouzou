import assert from "node:assert/strict";
import test from "node:test";
import type { InboxPlan } from "@/lib/ai";
import {
  attachWebEvidenceSources,
  buildWebSearchQuery,
  collectPlanWebEvidence,
  fetchDeepSeekPage,
  searchDeepSeek,
} from "@/lib/web-search";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("搜索词优先使用翻译后的目标并截断到 128 个字符", () => {
  const query = buildWebSearchQuery({
    content: "我想找海外设计工具，但先别推荐付费的",
    history: [{ key: "scope", question: "范围？", options: [], answer: ["只要今年上线的新产品"] }],
    translation: {
      originalInput: "我想找海外设计工具",
      literalMeaning: "寻找海外设计工具",
      normalizedIntent: "筛选今年上线的海外设计工具",
      confirmedFacts: ["不推荐付费工具"],
      interpretations: [],
      valueJudgments: [],
      goals: ["找到可试用的新产品"],
      constraints: ["免费优先"],
      unknowns: [],
      readiness: "ready",
      missingSlots: [],
      reason: "测试",
      desiredOutcome: "得到一份今年可试用的海外设计工具清单",
    },
  });
  assert.match(query, /得到一份今年可试用的海外设计工具清单/);
  assert.ok(Array.from(query).length <= 128);
});

test("需要外部信息时调用 DeepSeek Search 并规范化结果", async () => {
  let requestedUrl = "";
  let requestBody: Record<string, unknown> = {};
  const evidence = await collectPlanWebEvidence({
    content: "查一下 2026 年最新的设计工具价格",
    translation: null,
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com",
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(url);
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return jsonResponse({
        results: [
          {
            rerank_score: 2.4,
            title: "设计工具价格页",
            url: "https://example.com/pricing",
            snippet: "价格说明",
            summary: "2026 年新版价格说明。",
            site_name: "Example",
            date: "2026-10-16T00:00:00+00:00",
            authority: 3,
          },
        ],
      });
    }) as typeof fetch,
  });

  assert.equal(requestedUrl, "https://api.deepseek.com/v1/tools/search");
  assert.equal(requestBody.need_content, false);
  assert.equal(evidence.status, "ok");
  assert.equal(evidence.results[0]?.title, "设计工具价格页");
  assert.equal(evidence.results[0]?.siteName, "Example");
});

test("普通任务不触发搜索", async () => {
  let called = false;
  const evidence = await collectPlanWebEvidence({
    content: "整理书桌",
    apiKey: "test-key",
    fetchImpl: (async () => {
      called = true;
      return jsonResponse({ results: [] });
    }) as typeof fetch,
  });

  assert.equal(called, false);
  assert.equal(evidence.status, "skipped");
});

test("写操作不让模型自动联网执行", async () => {
  let called = false;
  const evidence = await collectPlanWebEvidence({
    content: "发布这篇文章",
    apiKey: "test-key",
    fetchImpl: (async () => {
      called = true;
      return jsonResponse({ results: [] });
    }) as typeof fetch,
  });

  assert.equal(called, false);
  assert.equal(evidence.status, "skipped");
});

test("用户给了网址时走 Fetch 接口", async () => {
  let requestedUrl = "";
  const evidence = await collectPlanWebEvidence({
    content: "看看这篇文章 https://example.com/article",
    apiKey: "test-key",
    fetchImpl: (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return jsonResponse({
        title: "文章标题",
        content: "# 正文\n\n这里是可读内容。",
      });
    }) as typeof fetch,
  });

  assert.equal(requestedUrl, "https://api.deepseek.com/v1/tools/fetch");
  assert.equal(evidence.status, "ok");
  assert.equal(evidence.fetchedUrl, "https://example.com/article");
  assert.equal(evidence.results[0]?.title, "文章标题");
});

test("搜索失败不会抛错，返回 failed 让方案降级", async () => {
  const evidence = await collectPlanWebEvidence({
    content: "查一下最新价格",
    apiKey: "test-key",
    fetchImpl: (async () => jsonResponse({ error: "bad" }, 429)) as typeof fetch,
  });

  assert.equal(evidence.status, "failed");
  assert.equal(evidence.error, "search_http_429");
});

test("base url 已带 /v1 时不会重复拼接", async () => {
  let requestedUrl = "";
  await searchDeepSeek({
    query: "test",
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com/v1",
    fetchImpl: (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return jsonResponse({ results: [] });
    }) as typeof fetch,
  });
  assert.equal(requestedUrl, "https://api.deepseek.com/v1/tools/search");
});

test("Fetch 接口返回 Markdown 正文", async () => {
  const page = await fetchDeepSeekPage({
    url: "https://example.com",
    apiKey: "test-key",
    fetchImpl: (async () =>
      jsonResponse({
        title: "Example",
        content: "# Example\n\ntext",
      })) as typeof fetch,
  });
  assert.equal(page.title, "Example");
  assert.match(page.content, /# Example/);
});

test("购买决策先检索实时信息，但写操作仍需确认", async () => {
  let called = false;
  const evidence = await collectPlanWebEvidence({
    content: "买一个 5000 元以内的键盘",
    apiKey: "test-key",
    fetchImpl: (async () => {
      called = true;
      return jsonResponse({
        results: [
          {
            title: "键盘价格",
            url: "https://example.com/keyboard",
            summary: "当前在售。",
            rerank_score: 2,
          },
        ],
      });
    }) as typeof fetch,
  });

  assert.equal(called, true);
  assert.equal(evidence.kind, "search");
  assert.equal(evidence.status, "ok");
});

test("真实来源会写进首条任务备注", () => {
  const plan = {
    tasks: [{ notes: "原有说明" }],
  } as InboxPlan;
  attachWebEvidenceSources(plan, {
    status: "ok",
    kind: "search",
    query: "test",
    fetchedAt: "2026-10-16T00:00:00.000Z",
    results: [
      {
        title: "官方价格页",
        url: "https://example.com/pricing",
        snippet: "",
        summary: "价格说明",
        siteName: "Example",
        publishedAt: null,
        authority: 3,
        rerankScore: 2,
      },
    ],
  });

  assert.equal(plan.sources, undefined);
  assert.match(plan.tasks[0]?.notes ?? "", /原有说明/);
  assert.match(plan.tasks[0]?.notes ?? "", /参考来源：/);
  assert.match(plan.tasks[0]?.notes ?? "", /https:\/\/example\.com\/pricing/);
});