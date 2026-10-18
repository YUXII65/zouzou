/**
 * 首启计划质量评测。
 *
 * 新人第一次写下想法时走的这条路，必须和正式计划一样能直接落地：
 * - 有默认推荐，已经替用户拍板，而不是让他自己去设计几个方案
 * - 有 2-4 条执行步骤，每条写清去哪里、做什么
 * - 主方案不可行时给得出替代路径
 *
 * 生产代码与评测共用 ai-prompts.ts 里的同一份 prompt，避免两边悄悄分叉。
 *
 * 用法：
 *   node --experimental-strip-types scripts/evaluate-first-run.mjs
 *   node --experimental-strip-types scripts/evaluate-first-run.mjs --label=v3.5
 */
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { createChainRunner } from "./lib/run-chain.mjs";
import {
  BANNED_OUTPUT_PHRASES,
  DEFERRED_DECISION_LANGUAGE,
  isWeakGeneratedTitle,
} from "../src/lib/ai-quality.ts";

const root = path.resolve(import.meta.dirname, "..");
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
const label = argOf("label") ?? "";

const chain = createChainRunner({ baseUrl, apiKey, model });

const cases = [
  {
    id: "light-meal-replacement",
    title: "轻食代替外卖（黄金用例）",
    input: "我想用轻食代替外卖，午餐和晚餐都要解决，不想开火也不想算热量。",
    expect: {
      minSteps: 2,
      recommendationMentions: [
        "鸡胸", "牛肉", "鸡蛋", "豆干", "豆腐", "虾仁",
        "沙拉", "饭团", "玉米", "即食蔬菜", "主食",
      ],
    },
  },
  {
    id: "personal-site",
    title: "个人网站第一版",
    input: "我想做一个个人网站，可能是作品集也可能是博客，还没想清楚，但想尽快有个能展示的东西。",
    expect: { minSteps: 2 },
  },
  {
    id: "stalled-project-restart",
    title: "停滞项目重启",
    input: "我的下一步项目已经停了两周，最近复盘说要继续，但打开项目就不知道从哪里开始。",
    expect: { minSteps: 2 },
  },
];

// 禁词来自 src/lib/ai-quality.ts 的唯一权威列表，不在这里再抄一份。
const BANNED = new RegExp(
  BANNED_OUTPUT_PHRASES.map((phrase) =>
    phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|"),
);
// 只在「推荐 / 步骤 / 替代方案」的文本里查，并且用 \n 分隔每一条，
// 避免正则跨过 JSON 引号，在相邻步骤之间拼出一个假匹配。
/** 首次引导和主链共用同一套两段 Agent，这里把 plans[0] 映射成首启字段。 */
async function callPlan(idea) {
  const { plan } = await chain.runChain(idea, { maxTasks: 3 });
  const task = Array.isArray(plan.tasks) ? plan.tasks[0] ?? {} : {};
  return {
    projectName: plan.projectName ?? "",
    projectObjective: plan.projectObjective ?? "",
    projectMilestone: plan.projectMilestone ?? "",
    taskTitle: task.title ?? "",
    taskShortTitle: task.shortTitle ?? "",
    taskRecommendation: task.recommendation ?? "",
    taskExecutionSteps: Array.isArray(task.executionSteps) ? task.executionSteps : [],
    taskFallback: task.fallback ?? "",
  };
}

function runChecks(aiCase, plan) {
  const issues = [];
  const recommendation = String(plan?.taskRecommendation ?? "").trim();
  const steps = Array.isArray(plan?.taskExecutionSteps)
    ? plan.taskExecutionSteps.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const fallback = String(plan?.taskFallback ?? "").trim();
  const whole = JSON.stringify(plan ?? {});
  const answerText = [recommendation, ...steps, fallback].join("\n");

  if (!recommendation) {
    issues.push("没有 taskRecommendation，等于把决定推回给用户");
  } else if (recommendation.length < 10) {
    issues.push(`taskRecommendation 太笼统：${recommendation}`);
  } else if (recommendation.length > 240) {
    issues.push(`taskRecommendation 太长（${recommendation.length} 字），应该在步骤里展开`);
  }
  if (BANNED.test(whole)) {
    issues.push("出现了把决定推回给用户的表达");
  }
  if (DEFERRED_DECISION_LANGUAGE.test(answerText)) {
    issues.push("推荐把决定推迟给用户，而不是直接给出答案");
  }

  const minSteps = aiCase.expect?.minSteps ?? 2;
  if (steps.length < minSteps) {
    issues.push(`taskExecutionSteps 只有 ${steps.length} 条，至少要 ${minSteps} 条`);
  }
  if (steps.some((step) => step.length < 4)) {
    issues.push("有执行步骤过短，写不清去哪里、做什么");
  }

  const mentions = aiCase.expect?.recommendationMentions ?? [];
  const haystack = `${recommendation} ${steps.join(" ")} ${fallback}`;
  if (mentions.length && !mentions.some((word) => haystack.includes(word))) {
    issues.push(`推荐里没有出现任何可执行线索：${mentions.join(" / ")}`);
  }

  for (const field of [
    "projectName",
    "projectObjective",
    "projectMilestone",
    "taskTitle",
    "taskShortTitle",
  ]) {
    if (!String(plan?.[field] ?? "").trim()) issues.push(`${field} 为空`);
  }
  if (isWeakGeneratedTitle(plan?.projectName, aiCase.input)) {
    issues.push("projectName 不是重新概括的语义标题");
  }
  if (isWeakGeneratedTitle(plan?.taskShortTitle, plan?.taskTitle)) {
    issues.push("taskShortTitle 不是重新概括的语义标题");
  }
  if (plan?.taskTitle && String(plan.taskTitle).includes(aiCase.input)) {
    issues.push("taskTitle 直接复用了用户原话");
  }

  return issues;
}

const rows = [];
for (const aiCase of cases) {
  let plan = null;
  let issues = [];
  try {
    plan = await callPlan(aiCase.input);
    issues = runChecks(aiCase, plan);
  } catch (error) {
    issues = [error instanceof Error ? error.message : String(error)];
  }
  rows.push({
    id: aiCase.id,
    title: aiCase.title,
    input: aiCase.input,
    recommendation: plan?.taskRecommendation ?? "",
    steps: Array.isArray(plan?.taskExecutionSteps) ? plan.taskExecutionSteps : [],
    fallback: plan?.taskFallback ?? "",
    issues,
    pass: issues.length === 0,
  });
}

const passed = rows.filter((row) => row.pass).length;
const report = [
  "# 首启计划质量评测",
  "",
  `> 生成时间：${new Date().toISOString()}`,
  `> 模型：${model}`,
  `> 用例数：${rows.length}，通过：${passed}，失败：${rows.length - passed}`,
  "",
  ...rows.flatMap((row) => [
    `## ${row.title}（${row.pass ? "通过" : "失败"}）`,
    "",
    `- 输入：${row.input}`,
    `- 默认推荐：${row.recommendation || "-"}`,
    `- 执行步骤：${row.steps.length ? row.steps.join(" → ") : "-"}`,
    `- 替代方案：${row.fallback || "（留空）"}`,
    `- 判定：${row.issues.join("；") || "OK"}`,
    "",
  ]),
].join("\n");

const reportPath = path.join(
  root,
  "docs",
  label ? `first-run-eval-${label}.md` : "first-run-eval.md",
);
const resultsPath = path.join(
  root,
  "docs",
  label ? `first-run-eval-${label}.json` : "first-run-eval.json",
);
fs.writeFileSync(reportPath, report, "utf8");
fs.writeFileSync(
  resultsPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), model, rows }, null, 2),
  "utf8",
);

for (const row of rows) {
  console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id} | ${row.issues.join("; ") || row.recommendation}`);
}
console.log(`\n首启计划评测：${passed}/${rows.length} 通过`);
process.exitCode = passed === rows.length ? 0 : 1;
