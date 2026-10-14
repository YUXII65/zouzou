/**
 * 三模式判断评测
 *
 * 为什么单独做一份评测：模式判断是 v3.7 最难的一步——不能靠关键词，也不该问用户，
 * 只能靠模型推理"用户真正要解决什么"。这个脚本用来反复跑、比较几轮提示词改动的效果。
 *
 * 重要：system prompt 直接引用 src/lib/ai-prompts.ts 里生产用的那一份，不要在脚本里另写近似版，
 * 否则"评测通过"不能说明生产判断合格（这个坑在 evaluate-ai.mjs 里已经踩过一次）。
 *
 * 用法：
 *   node --experimental-strip-types scripts/evaluate-mode-judgment.mjs
 *   node --experimental-strip-types scripts/evaluate-mode-judgment.mjs --limit=12 --debug
 *   node --experimental-strip-types scripts/evaluate-mode-judgment.mjs --label=r1
 *   node --experimental-strip-types scripts/evaluate-mode-judgment.mjs --print-prompt
 *
 * 退出码：0 = 总体准确率达到 --gate（默认 0.9）；1 = 未达到
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import "dotenv/config";
import { extractJsonObject as extractJson } from "../src/lib/json-extract.ts";
import {
  MODE_JUDGMENT_SYSTEM_PROMPT,
  buildModeJudgmentUserPayload,
} from "../src/lib/ai-prompts.ts";

const root = path.resolve(import.meta.dirname, "..");
const corpusPath = path.join(root, "scripts", "mode-judgment-corpus.json");
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

const SYSTEM_PROMPT = MODE_JUDGMENT_SYSTEM_PROMPT;
const PROMPT_HASH = createHash("sha256")
  .update(SYSTEM_PROMPT)
  .digest("hex")
  .slice(0, 12);

const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const model =
  process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || "deepseek-v4-flash";
const baseUrl = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/$/, "");

const args = process.argv.slice(2);
const debug = args.includes("--debug");
const argOf = (name) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

if (args.includes("--print-prompt")) {
  console.log(`提示词指纹：${PROMPT_HASH}`);
  console.log(`模型：${model}`);
  console.log("---- system prompt ----");
  console.log(SYSTEM_PROMPT);
  process.exit(0);
}

if (!apiKey) {
  console.error("缺少 AI API Key，请设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY。");
  process.exit(1);
}

const limit = argOf("limit") ? Number(argOf("limit")) : null;
const batchSize = argOf("batch") ? Number(argOf("batch")) : 6;
const gate = argOf("gate") ? Number(argOf("gate")) : 0.9;
const withClarify = args.includes("--with-clarify");
const label = argOf("label") ?? "";
const fileBase = label ? `mode-judgment-${label}` : "mode-judgment";
const reportPath = path.join(root, "docs", `${fileBase}.md`);
const resultsPath = path.join(root, "docs", `${fileBase}.json`);
const MODES = ["normal", "longterm", "explore"];

/** 固定种子的洗牌：让每批混着三种模式，同时保证多轮之间可比 */
function seededShuffle(items, seed = 20261001) {
  const copy = [...items];
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

let cases = seededShuffle(corpus.cases);
if (limit) cases = cases.slice(0, limit);

async function judgeBatch(batch) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildModeJudgmentUserPayload(
            batch.map((item) => ({
              id: item.id,
              input: item.input,
              ...(withClarify && item.clarified ? { clarified: item.clarified } : {}),
            })),
          ),
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      ...(/deepseek/i.test(model) || /deepseek/i.test(baseUrl)
        ? { reasoning_effort: "none" }
        : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  if (debug) console.log(`\n---- raw ----\n${content}`);
  return parseJudgeArray(content);
}

/** 模型可能返回裸数组、被代码块包住的数组、或 {results:[...]}，这里都兜住 */
function parseJudgeArray(content) {
  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const direct = tryParse(content.trim());
  if (Array.isArray(direct)) return direct;
  if (direct && Array.isArray(direct.results)) return direct.results;
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start >= 0 && end > start) {
    const sliced = tryParse(content.slice(start, end + 1));
    if (Array.isArray(sliced)) return sliced;
  }
  const obj = tryParse(extractJson(content) ?? "null");
  if (obj && Array.isArray(obj.results)) return obj.results;
  return obj ? [obj] : [];
}

const results = [];
for (let i = 0; i < cases.length; i += batchSize) {
  const batch = cases.slice(i, i + batchSize);
  let judged = [];
  let error = null;
  try {
    judged = await judgeBatch(batch);
  } catch (caught) {
    error = caught.message;
  }
  const byId = new Map(
    (Array.isArray(judged) ? judged : []).map((item) => [String(item?.id ?? ""), item]),
  );
  for (const item of batch) {
    const got = byId.get(item.id);
    const actual = got?.mode ?? null;
    results.push({
      id: item.id,
      group: item.group,
      input: item.input,
      expected: item.expected,
      actual,
      correct: actual === item.expected,
      confidence: got?.confidence ?? null,
      realNeed: got?.realNeed ?? "",
      reason: got?.reason ?? "",
      error: actual ? null : error,
    });
  }
  process.stdout.write(`.`);
}
process.stdout.write("\n");

/* ---------- 漏项重试：批量返回里偶尔会漏掉某条，单独再问一次 ---------- */
const missing = results.filter((item) => !item.actual);
if (missing.length) {
  console.log(`\n有 ${missing.length} 条没拿到判断，改为单条重试…`);
  for (const item of missing) {
    for (let attempt = 1; attempt <= 2 && !item.actual; attempt += 1) {
      try {
        const judged = await judgeBatch([item]);
        const got = judged.find((entry) => String(entry?.id ?? "") === item.id) ?? judged[0];
        if (got?.mode) {
          item.actual = got.mode;
          item.correct = got.mode === item.expected;
          item.confidence = got.confidence ?? null;
          item.realNeed = got.realNeed ?? "";
          item.reason = got.reason ?? "";
          item.error = null;
        }
      } catch (caught) {
        item.error = caught.message;
      }
    }
  }
}

const total = results.length;
const correct = results.filter((r) => r.correct).length;
const accuracy = total ? correct / total : 0;
const byGroup = {};
for (const group of [...new Set(results.map((r) => r.group))]) {
  const rows = results.filter((r) => r.group === group);
  byGroup[group] = {
    total: rows.length,
    correct: rows.filter((r) => r.correct).length,
    accuracy: rows.filter((r) => r.correct).length / rows.length,
  };
}
const confusion = {};
for (const expected of MODES) {
  confusion[expected] = {};
  for (const actual of [...MODES, "null"]) {
    confusion[expected][actual] = results.filter(
      (r) => r.expected === expected && (r.actual ?? "null") === actual,
    ).length;
  }
}
const failures = results.filter((r) => !r.correct);

console.log(`\n提示词指纹 ${PROMPT_HASH} | 模型 ${model} | 批大小 ${batchSize}`);
console.log(`总体准确率：${correct}/${total} = ${(accuracy * 100).toFixed(1)}%`);
for (const [group, stat] of Object.entries(byGroup)) {
  console.log(
    `  ${group}: ${stat.correct}/${stat.total} = ${(stat.accuracy * 100).toFixed(1)}%`,
  );
}
console.log("混淆矩阵（行=期望，列=实际）：");
for (const expected of MODES) {
  console.log(
    `  ${expected.padEnd(9)} ${MODES.map((m) => `${m}:${confusion[expected][m]}`).join("  ")}  null:${confusion[expected].null}`,
  );
}
if (failures.length) {
  console.log(`\n判错的 ${failures.length} 条：`);
  for (const item of failures) {
    console.log(`  ${item.id} [期望 ${item.expected} / 实际 ${item.actual ?? "无"}] ${item.input}`);
    console.log(`      模型认为真实需求：${item.realNeed || "-"}`);
    console.log(`      理由：${item.reason || item.error || "-"}`);
  }
}

const summary = [
  "# 三模式判断评测",
  "",
  `> 生成时间：${new Date().toISOString()}`,
  `> 模型：${model}`,
  `> 提示词指纹：${PROMPT_HASH}（取自 src/lib/ai-prompts.ts）`,
  `> 用例：${total} 条（范式 ${byGroup.paradigm?.total ?? 0} + 对照 ${byGroup.contrast?.total ?? 0}）`,
  `> 总体准确率：${(accuracy * 100).toFixed(1)}%`,
  "",
  "## 分组准确率",
  "",
  "| 分组 | 正确 | 总数 | 准确率 |",
  "| --- | --- | --- | --- |",
  ...Object.entries(byGroup).map(
    ([group, stat]) =>
      `| ${group} | ${stat.correct} | ${stat.total} | ${(stat.accuracy * 100).toFixed(1)}% |`,
  ),
  "",
  "## 混淆矩阵",
  "",
  "| 期望 \\ 实际 | normal | longterm | explore | 无输出 |",
  "| --- | --- | --- | --- | --- |",
  ...MODES.map(
    (expected) =>
      `| ${expected} | ${confusion[expected].normal} | ${confusion[expected].longterm} | ${confusion[expected].explore} | ${confusion[expected].null} |`,
  ),
  "",
  "## 判错的条目",
  "",
  ...(failures.length
    ? failures.map(
        (item) =>
          `- **${item.id}**（期望 ${item.expected}，实际 ${item.actual ?? "无"}）：${item.input}\n  - 模型认为的真实需求：${item.realNeed || "-"}\n  - 理由：${item.reason || item.error || "-"}`,
      )
    : ["（全部判对）"]),
  "",
].join("\n");

fs.writeFileSync(reportPath, summary, "utf8");
fs.writeFileSync(
  resultsPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), model, promptHash: PROMPT_HASH, accuracy, byGroup, confusion, results }, null, 2),
  "utf8",
);

console.log(`\n报告：${path.relative(root, reportPath)}`);
process.exitCode = accuracy >= gate ? 0 : 1;
