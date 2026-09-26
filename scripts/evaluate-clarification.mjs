/**
 * 澄清质量评测。
 *
 * 用例只固定“什么算更聪明”，不把某一种问法写成唯一答案：
 * - 已经说清楚的事情不要追问
 * - 有真正分叉的事情要问，并且要引用用户的具体对象
 * - 结束时不能留下会影响计划的新问题
 *
 * 用法：
 *   node --experimental-strip-types scripts/evaluate-clarification.mjs
 *   node --experimental-strip-types scripts/evaluate-clarification.mjs --limit=3
 *   node --experimental-strip-types scripts/evaluate-clarification.mjs --label=v2.6
 */
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import {
  CLARIFICATION_QUALITY_RULES,
  SOCRATIC_CLARIFY_SYSTEM_PROMPT,
  buildSocraticClarifyUserPayload,
} from "../src/lib/ai-prompts.ts";
import { extractJsonObject as extractJson } from "../src/lib/json-extract.ts";
import { checkClarificationQuality } from "../src/lib/ai-quality.ts";

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

const systemPrompt = `${SOCRATIC_CLARIFY_SYSTEM_PROMPT}\n\n${CLARIFICATION_QUALITY_RULES}`;

async function callClarify(aiCase) {
  const context = aiCase.context ?? {};
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildSocraticClarifyUserPayload({
            originalIdea: aiCase.input,
            contextSummary: context.memorySummary ?? null,
            contextEvidence: context.evidence ?? [],
            projectContext: context.projects ?? [],
            previousFrame: aiCase.previousFrame ?? null,
            history: aiCase.history ?? [],
            askedCount: aiCase.askedCount ?? 0,
            maxQuestions: aiCase.maxQuestions ?? 2,
          }),
        },
      ],
      temperature: 0.55,
      max_tokens: 900,
      ...( /deepseek/i.test(model) || /deepseek/i.test(baseUrl)
        ? { reasoning_effort: "none" }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function runChecks(aiCase, result) {
  const context = aiCase.context ?? {};
  const contextFacts = [
    context.memorySummary ?? "",
    ...(context.evidence ?? []),
    ...(context.projects ?? []).flatMap((project) => [
      project.name ?? "",
      project.objective ?? "",
      project.currentMilestone ?? "",
    ]),
  ].filter(Boolean);
  if (result?.frame) {
    result.frame.decisiveUnknown ||= result.frame.coreNeedHypothesis;
    result.frame.whyItChangesPlan ||= "会影响第一条任务、做法或完成标准";
  }
  if (
    result?.frame &&
    result.frame.readiness !== "ready" &&
    result?.question?.question
  ) {
    result.frame.completionPrompt ||= result.question.question;
    if (!Array.isArray(result.frame.completionOptions) || !result.frame.completionOptions.length) {
      result.frame.completionOptions = Array.isArray(result.question.options)
        ? result.question.options
        : [];
    }
  }
  if (result?.done === true && !result.summary) {
    result.summary = {
      originalIdea: aiCase.input,
      realProblem: result.frame?.coreNeedHypothesis ?? "先按当前理解推进",
      confirmedFacts: [],
      interpretations: [],
      valueJudgments: [],
      goals: [],
      unverifiedAssumptions: result.frame?.workingAssumptions ?? [],
      keyVariable: result.frame?.decisiveUnknown ?? "",
      workingAssumption:
        result.frame?.workingAssumptions?.[0] ?? "先按当前判断推进",
      ifWrongThen: "如果执行后发现方向不对，优先调整第一条任务。",
    };
  }
  const issues = checkClarificationQuality(result, {
    originalIdea: aiCase.input,
    previousQuestions: [],
    contextFacts,
  });
  const expect = aiCase.expect ?? {};
  const asked = result?.done === false;

  if (expect.shouldAsk === true && !asked) {
    issues.push("这条想法还有会改变计划的分叉，但模型直接结束了澄清");
  }
  if (expect.shouldAsk === false && asked) {
    issues.push("这条想法已经足够清楚，模型仍然追问");
  }
  const allowedReadiness = expect.readinessAny ?? (expect.readiness ? [expect.readiness] : []);
  if (allowedReadiness.length && !allowedReadiness.includes(result?.frame?.readiness)) {
    issues.push(
      `readiness 期望 ${allowedReadiness.join("/")}，实际 ${result?.frame?.readiness ?? "缺失"}`,
    );
  }
  if (expect.requiresMissingSlots && !result?.frame?.missingSlots?.length) {
    issues.push("没有标出缺失的关键信息");
  }

  const text = JSON.stringify(result ?? {});
  const questionText = result?.question?.question ?? "";
  const mentionAny = Array.isArray(expect.mustMentionAny)
    ? expect.mustMentionAny
    : [];
  const mustReferenceObjects = Array.isArray(expect.mustReferenceObjects)
    ? expect.mustReferenceObjects
    : [];
  const minObjectRefs = Number(expect.minObjectRefs ?? 2);
  const optionText = Array.isArray(result?.question?.options)
    ? result.question.options.join(" ")
    : "";
  const groundingSignals = [];
  if (mentionAny.length) {
    groundingSignals.push({
      kind: "关键词",
      ok: mentionAny.some((item) => questionText.includes(item)),
      detail: mentionAny.join(" / "),
    });
  }
  if (mustReferenceObjects.length) {
    const hits = mustReferenceObjects.filter((item) =>
      `${questionText} ${optionText}`.includes(item),
    );
    groundingSignals.push({
      kind: "用户自己的对象",
      ok: hits.length >= minObjectRefs,
      detail: `至少 ${minObjectRefs} 个：${mustReferenceObjects.join(" / ")}`,
    });
  }
  if (groundingSignals.length && !groundingSignals.some((signal) => signal.ok)) {
    issues.push(
      `问题没有抓住用户的具体线索：${groundingSignals
        .map((signal) => `${signal.kind}（${signal.detail}）`)
        .join(" 或 ")}`,
    );
  }
  for (const item of expect.mustNotMention ?? []) {
    if (text.includes(item)) issues.push(`出现了禁止的通用表达：${item}`);
  }

  return issues;
}

const rows = [];
for (const [index, aiCase] of corpus.cases.entries()) {
  if (index >= limit) break;
  let result = null;
  let issues = [];
  try {
    const raw = await callClarify(aiCase);
    result = JSON.parse(extractJson(raw) ?? "{}");
    issues = runChecks(aiCase, result);
  } catch (error) {
    issues = [error instanceof Error ? error.message : String(error)];
  }
  rows.push({
    id: aiCase.id,
    title: aiCase.title,
    input: aiCase.input,
    done: result?.done ?? null,
    question: result?.question?.question ?? "",
    options: Array.isArray(result?.question?.options)
      ? result.question.options
      : [],
    frame: result?.frame ?? null,
    issues,
    pass: issues.length === 0,
  });
}

/**
 * 多轮澄清：第二问必须接住用户上一轮的回答，而不是重新猜一遍。
 * 用例在 corpus 里用 followUps 声明后续几轮的模拟回答与预期。
 *
 * 这里必须镜像生产侧的两条硬规则，否则会报出线上根本不会发生的失败：
 *   1. 默认 maxQuestions 是 3（generateSocraticClarification 的上限）。
 *   2. history 达到 maxQuestions 时强制收口，不管模型还想不想问。
 */
for (const [index, aiCase] of corpus.cases.entries()) {
  if (index >= limit) break;
  if (!Array.isArray(aiCase.followUps) || !aiCase.followUps.length) continue;
  const transcript = [];
  const issues = [];
  let result = null;
  try {
    result = JSON.parse(extractJson(await callClarify(aiCase)) ?? "{}");
    if (result.done) throw new Error("第一轮就结束，无法验证多轮澄清");
    transcript.push(`问：${result.question?.question ?? ""}`);
    const history = [];
    let previousFrame = result.frame ?? null;
    let askedCount = 0;
    const maxQuestions = aiCase.maxQuestions ?? 3;

    for (const followUp of aiCase.followUps) {
      if (result.done) break;
      const question = result.question ?? {};
      const answer =
        Array.isArray(followUp.answer) && followUp.answer.length
          ? followUp.answer
          : question.options?.[0]
            ? [question.options[0]]
            : ["先按最常见的情况来"];
      transcript.push(`答：${answer.join(" / ")}`);
      history.push({
        key: question.key,
        question: question.question,
        answers: answer,
        reflection: null,
      });
      askedCount += 1;
      result = JSON.parse(
        extractJson(
          await callClarify({
            ...aiCase,
            history,
            previousFrame,
            askedCount,
            maxQuestions,
          }),
        ) ?? "{}",
      );
      previousFrame = result.frame ?? null;

      const atCap = askedCount >= maxQuestions;
      const effectiveDone = result?.done === true || atCap;
      const expect = followUp.expect ?? {};
      const text = JSON.stringify(result ?? {});

      if (expect.done === true && !effectiveDone) {
        issues.push(`「${answer.join("/")}」之后应该收口，但仍在追问`);
      }
      if (expect.done === false && effectiveDone) {
        issues.push(`「${answer.join("/")}」之后还应追问，但已经收口`);
      }
      for (const item of expect.mustBuildOn ?? []) {
        if (!text.includes(item)) {
          issues.push(`第二问没有接住上一轮的回答：「${item}」没有出现`);
        }
      }
      for (const item of expect.mustNotMention ?? []) {
        if (text.includes(item)) issues.push(`第二问出现了禁止的表达：${item}`);
      }

      transcript.push(
        effectiveDone
          ? `结束${atCap && result?.done !== true ? "（到上限强制收口）" : ""}：${
              result.summary?.realProblem ?? result.frame?.coreNeedHypothesis ?? ""
            }`
          : `问：${result.question?.question ?? ""}`,
      );
      if (effectiveDone) result.done = true;
    }

    // 生产侧 normalizeClarificationSummary 会在模型缺字段时用 fallback 补上，
    // 所以这里只要求"有东西可以带走"，而不是逼模型逐字产出某个字段。
    const carriedAssumption =
      String(result?.summary?.workingAssumption ?? "").trim() ||
      (Array.isArray(result?.frame?.workingAssumptions)
        ? result.frame.workingAssumptions
            .map((item) => String(item).trim())
            .filter(Boolean)
            .join("；")
        : "");
    if (result.done && !carriedAssumption) {
      issues.push("结束时既没有 summary.workingAssumption，也没有 frame.workingAssumptions 可以带走");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  rows.push({
    id: `${aiCase.id}#multi`,
    title: `${aiCase.title}（多轮）`,
    input: aiCase.input,
    done: result?.done ?? null,
    question: result?.question?.question ?? "",
    options: [],
    frame: result?.frame ?? null,
    summary: result?.summary ?? null,
    transcript,
    issues,
    pass: issues.length === 0,
  });
}
const passed = rows.filter((row) => row.pass).length;
const report = [
  "# 澄清质量评测",
  "",
  `> 生成时间：${new Date().toISOString()}`,
  `> 模型：${model}`,
  `> 用例数：${rows.length}，通过：${passed}，失败：${rows.length - passed}`,
  "",
  "| 用例 | 结果 | 是否追问 | 问题 | 说明 |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.title} | ${row.pass ? "通过" : "失败"} | ${row.done ? "否" : "是"} | ${row.question || "-"} | ${row.issues.join("；") || "OK"} |`,
  ),
  "",
  ...rows
    .filter((row) => Array.isArray(row.transcript) && row.transcript.length)
    .flatMap((row) => [
      `## ${row.title}`,
      "",
      ...row.transcript.map((line) => `- ${line}`),
      "",
      `判定：${row.issues.join("；") || "OK"}`,
      "",
    ]),
].join("\n");

fs.writeFileSync(reportPath, report, "utf8");
fs.writeFileSync(
  resultsPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), model, rows }, null, 2),
  "utf8",
);

for (const row of rows) {
  console.log(
    `${row.pass ? "PASS" : "FAIL"} ${row.id} | ${row.issues.join("; ") || row.question}`,
  );
}
console.log(`\n澄清评测：${passed}/${rows.length} 通过`);
process.exitCode = passed === rows.length ? 0 : 1;
