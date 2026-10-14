/**
 * 翻译质量评测。
 *
 * 走走的链路固定为：翻译 -> 生成内容 -> 收敛，且默认零提问自动收敛。
 * 这个评测只看第 1 段：翻译 Agent 有没有把用户原话翻译成结构化语义，
 * 并给出一个可以带着往下走的默认判断（workingAssumption / ifWrongThen）。
 *
 * 用法：
 *   node --experimental-strip-types scripts/evaluate-clarification.mjs
 *   node --experimental-strip-types scripts/evaluate-clarification.mjs --limit=3
 */
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import {
  CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
  buildClarificationTranslationUserPayload,
} from "../src/lib/ai-prompts.ts";
import { extractJsonObject as extractJson } from "../src/lib/json-extract.ts";

const root = path.resolve(import.meta.dirname, "..");
const corpus = JSON.parse(
  fs.readFileSync(path.join(root, "scripts", "clarification-eval-corpus.json"), "utf8"),
);

const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const model =
  process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || "deepseek-v4-flash";
const baseUrl = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/$/, "");

if (!apiKey) {
  console.error("缺少 AI API Key，请设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY。");
  process.exit(1);
}

const args = process.argv.slice(2);
const argOf = (name) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const limit = argOf("limit") ? Number(argOf("limit")) : corpus.cases.length;
const label = argOf("label") ?? "";
const reportPath = path.join(
  root,
  "docs",
  label ? `clarification-eval-${label}.md` : "clarification-eval.md",
);
const resultsPath = path.join(
  root,
  "docs",
  label ? `clarification-eval-${label}.json` : "clarification-eval.json",
);

async function requestChat(system, userContent, maxTokens) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
      ...(/deepseek/i.test(model) || /deepseek/i.test(baseUrl)
        ? { reasoning_effort: "none" }
        : {}),
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callTranslation(aiCase) {
  const context = aiCase.context ?? {};
  const raw = await requestChat(
    CLARIFICATION_TRANSLATION_SYSTEM_PROMPT,
    buildClarificationTranslationUserPayload({
      originalIdea: aiCase.input,
      contextSummary: context.memorySummary ?? null,
      contextEvidence: context.evidence ?? [],
      projectContext: context.projects ?? [],
      previousTranslation: null,
      inputAssessmentHint: null,
      history: [],
    }),
    1400,
  );
  const parsed = JSON.parse(extractJson(raw) ?? "{}");
  return {
    translation: parsed.translation ?? parsed ?? {},
    summary: parsed.summary ?? {},
    raw,
  };
}

function runChecks(aiCase, result) {
  const issues = [];
  const translation = result.translation ?? {};
  const summary = result.summary ?? {};
  if (!String(translation.normalizedIntent ?? "").trim()) {
    issues.push("translation 缺少 normalizedIntent");
  }
  if (!String(translation.literalMeaning ?? "").trim()) {
    issues.push("translation 缺少 literalMeaning");
  }
  if (!["ready", "needs_context", "needs_meaning"].includes(String(translation.readiness))) {
    issues.push("translation.readiness 非法或缺失");
  }
  if (!String(summary.workingAssumption ?? "").trim()) {
    issues.push("summary 缺少 workingAssumption，没给出默认推进判断");
  }
  if (!String(summary.ifWrongThen ?? "").trim()) {
    issues.push("summary 缺少 ifWrongThen，没说清假设错了怎么改");
  }
  const text = JSON.stringify(result);
  for (const phrase of aiCase.expect?.mustNotMention ?? []) {
    if (text.includes(phrase)) issues.push(`出现了禁止的表达：${phrase}`);
  }
  return issues;
}

const rows = [];
for (const [index, aiCase] of corpus.cases.entries()) {
  if (index >= limit) break;
  let result = null;
  let error = null;
  try {
    result = await callTranslation(aiCase);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const issues = error ? [error] : runChecks(aiCase, result);
  rows.push({
    id: aiCase.id,
    title: aiCase.title,
    input: aiCase.input,
    intent: result?.translation?.normalizedIntent ?? "",
    readiness: result?.translation?.readiness ?? "",
    assumption: result?.summary?.workingAssumption ?? "",
    issues,
    pass: issues.length === 0,
  });
}

const passed = rows.filter((row) => row.pass).length;
const report = [
  "# 翻译质量评测",
  "",
  `> 生成时间：${new Date().toISOString()}`,
  `> 模型：${model}`,
  `> 用例数：${rows.length}，通过：${passed}，失败：${rows.length - passed}`,
  "",
  "| 用例 | 结果 | 理解 | 默认假设 | 说明 |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.title} | ${row.pass ? "通过" : "失败"} | ${row.intent || "-"} | ${row.assumption || "-"} | ${row.issues.join("；") || "OK"} |`,
  ),
].join("\n");

fs.writeFileSync(reportPath, report, "utf8");
fs.writeFileSync(
  resultsPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), model, rows }, null, 2),
  "utf8",
);

for (const row of rows) {
  console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id} | ${row.issues.join("; ") || row.intent}`);
}
console.log(`\n翻译评测：${passed}/${rows.length} 通过`);
process.exitCode = passed === rows.length ? 0 : 1;
