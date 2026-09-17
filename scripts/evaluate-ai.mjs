/**
 * AI 计划质量评测
 *
 * 重要：这里的 system prompt 直接引用 src/lib/ai-prompts.ts 里生产用的那一份。
 * 之前的版本在这里另写了一份近似的提示词，改 src/lib/ai.ts 不会反映到评测结果上，
 * 于是「评测通过」并不能说明生产输出合格。现在两边共用同一常量，不会再分叉。
 *
 * 用法：
 *   node --experimental-strip-types scripts/evaluate-ai.mjs
 *   node --experimental-strip-types scripts/evaluate-ai.mjs --limit=3
 *   node --experimental-strip-types scripts/evaluate-ai.mjs --label=v2.6
 *   node --experimental-strip-types scripts/evaluate-ai.mjs --compare=docs/ai-eval-baseline-v2.5.json
 *   node --experimental-strip-types scripts/evaluate-ai.mjs --print-prompt
 *
 * 退出码：
 *   0  全部通过，且没有相对基线新增失败
 *   1  有失败用例，或出现回归
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import "dotenv/config";
import {
  OUTPUT_QUALITY_RULES,
  PLAN_SYSTEM_PROMPT,
  buildPlanUserPayload,
} from "../src/lib/ai-prompts.ts";
import {
  checkPlanQuality,
  compareAgainstBaseline,
} from "../src/lib/ai-quality.ts";

const root = path.resolve(import.meta.dirname, "..");
const corpusPath = path.join(root, "scripts", "ai-eval-corpus.json");
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

const SYSTEM_PROMPT = `${PLAN_SYSTEM_PROMPT}\n\n${OUTPUT_QUALITY_RULES}`;
/** 提示词指纹：对比基线时用它判断两次跑的到底是不是同一份 prompt */
const PROMPT_HASH = createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 12);

const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const model =
  process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || "deepseek-v4-flash";
const baseUrl = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/$/, "");

const args = process.argv.slice(2);
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

const limit = argOf("limit") ? Number(argOf("limit")) : corpus.cases.length;
const label = argOf("label") ?? "";
const comparePath = argOf("compare")
  ? path.resolve(root, argOf("compare"))
  : null;
const fileBase = label ? `ai-eval-baseline-${label}` : "ai-eval-baseline";
const reportPath = path.join(root, "docs", `${fileBase}.md`);
const resultsPath = path.join(root, "docs", `${fileBase}.json`);

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

async function callPlan(aiCase) {
  const context = aiCase.context ?? {};
  const projects = context.projects ?? [];
  const maxTasks = aiCase.checks?.maxTasks ?? null;

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
          content: buildPlanUserPayload({
            currentDate: new Date().toLocaleDateString("sv-SE"),
            content: aiCase.input,
            projectNames: projects.map((project) => project.name),
            projects,
            memorySummary: context.memorySummary ?? null,
            dimensionChoices: [],
            contextEvidence: context.evidence ?? [],
            maxTasks,
          }),
        },
      ],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** 用例自带的期待项 + 通用质量检查 */
function runChecks(aiCase, plan) {
  const checks = aiCase.checks ?? {};
  const issues = checkPlanQuality(plan, { maxTasks: checks.maxTasks });

  if (checks.mustMentionProject) {
    const text = JSON.stringify(plan ?? {});
    if (!text.includes(checks.mustMentionProject)) {
      issues.push(`计划没有提到项目「${checks.mustMentionProject}」`);
    }
  }

  return issues;
}

const rows = [];
const generatedAt = new Date().toISOString();

for (const [index, aiCase] of corpus.cases.entries()) {
  if (index >= limit) break;

  let plan = null;
  let error = null;

  try {
    const raw = await callPlan(aiCase);
    plan = JSON.parse(extractJson(raw) ?? "{}");
  } catch (caught) {
    error = caught.message;
  }

  const issues = error ? [error] : runChecks(aiCase, plan);
  rows.push({
    id: aiCase.id,
    title: aiCase.title,
    expected: aiCase.expected ?? [],
    action: plan?.action ?? null,
    taskCount: Array.isArray(plan?.tasks) ? plan.tasks.length : 0,
    reason: plan?.reason ?? "",
    failures: issues,
    pass: issues.length === 0,
  });
}

const passed = rows.filter((row) => row.pass).length;
const failed = rows.length - passed;

/* ---------- 与基线对比 ---------- */

let regression = null;
if (comparePath) {
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(comparePath, "utf8"));
  } catch (caught) {
    console.error(`读不到基线文件：${comparePath}（${caught.message}）`);
    process.exit(1);
  }

  const comparison = compareAgainstBaseline(previous.rows ?? [], rows);

  regression = {
    promptChanged: previous.promptHash ? previous.promptHash !== PROMPT_HASH : null,
    previousPromptHash: previous.promptHash ?? null,
    ...comparison,
  };

  console.log(`\n对比基线：${path.relative(root, comparePath)}`);
  if (regression.promptChanged === true) {
    console.log(
      `提示词已变化：${regression.previousPromptHash} → ${PROMPT_HASH}（差异可能来自 prompt 改动，不只是模型波动）`,
    );
  } else if (regression.promptChanged === false) {
    console.log(`提示词未变：${PROMPT_HASH}`);
  } else {
    console.log("基线里没有提示词指纹（旧格式），无法判断 prompt 是否改过。");
  }
  console.log(
    `新增失败：${comparison.newFailures.length}，修复：${comparison.fixed.length}，任务数变化：${comparison.taskCountChanged.length}，新增用例：${comparison.added.length}`,
  );
  for (const item of comparison.newFailures) {
    console.log(
      `  REGRESSION ${item.id}: ${item.before.join("；") || "通过"} → ${item.after.join("；")}`,
    );
  }
  for (const id of comparison.fixed) {
    console.log(`  FIXED ${id}`);
  }
  for (const item of comparison.taskCountChanged) {
    console.log(`  CHANGED ${item.id}: 任务数 ${item.before} → ${item.after}`);
  }
}

/* ---------- 落盘 ---------- */

const summary = [
  "# AI 评测基线",
  "",
  `> 生成时间：${generatedAt}`,
  `> 模型：${model}`,
  `> 提示词指纹：${PROMPT_HASH}（取自 src/lib/ai-prompts.ts）`,
  `> 用例数：${rows.length}，通过：${passed}，失败：${failed}`,
  "",
  "## 结果",
  "",
  "| 用例 | 结果 | action | 任务数 | 说明 |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.title} | ${row.pass ? "通过" : "失败"} | ${row.action ?? "-"} | ${row.taskCount} | ${
        row.failures.length ? row.failures.join("；") : row.reason.slice(0, 80)
      } |`,
  ),
  "",
  "## 说明",
  "",
  "system prompt 与生产共用 src/lib/ai-prompts.ts，检查规则在 src/lib/ai-quality.ts。",
  "结构检查与质量检查都自动化，但不等同于人工质量评分：",
  "空泛说法、模板句、shortTitle 截断可以被机器判死，任务是否真的切中处境仍然要人来读。",
  "",
].join("\n");

fs.writeFileSync(reportPath, summary, "utf8");
fs.writeFileSync(
  resultsPath,
  JSON.stringify(
    { generatedAt, model, promptHash: PROMPT_HASH, rows },
    null,
    2,
  ),
  "utf8",
);

for (const row of rows) {
  console.log(
    `${row.pass ? "PASS" : "FAIL"} ${row.id} | ${
      row.failures.length ? row.failures.join("; ") : row.reason
    }`,
  );
}

console.log(`\n基线：${passed}/${rows.length} 通过（提示词 ${PROMPT_HASH}）`);

const regressed = Boolean(regression?.newFailures.length);
// 用 exitCode 而不是 process.exit()：直接 exit 会在 fetch 的 keep-alive 连接还没关掉时
// 触发 Windows 上的 libuv 断言崩溃（0xC0000409），退出码反而变得不可信。
process.exitCode = failed || regressed ? 1 : 0;
