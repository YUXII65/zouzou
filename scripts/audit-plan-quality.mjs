import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PLAN_CRITIC_SYSTEM_PROMPT } from "../src/lib/agent-plan/prompts.ts";

const args = process.argv.slice(2);
const argOf = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const limit = Number(argOf("limit") || 8);
const minScore = Number(argOf("min-score") || 8);
const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const model = process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || "deepseek-v4-flash";
const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
if (!apiKey) {
  console.error("缺少 DEEPSEEK_API_KEY 或 OPENAI_API_KEY");
  process.exit(2);
}

async function reviewOne(project) {
  const tasks = project.tasks.map((task) => ({
    title: task.title,
    shortTitle: task.shortTitle,
    methodHint: (task.methodHint || "").slice(0, 320),
    doneWhen: (task.doneWhen || "").slice(0, 260),
    executionMode: task.executionMode,
    status: task.status,
    notes: (task.notes || "").slice(0, 200),
  }));
  const first = tasks[0];
  const payload = {
    originalIdea: project.objective || project.name,
    translation: null,
    summary: null,
    plan: {
      goal: project.objective,
      constraints: [],
      route: project.currentMilestone || "",
      steps: [],
    },
    composed: {
      projectName: project.name,
      projectObjective: project.objective,
      projectMilestone: project.currentMilestone,
      reason: "",
      userCard: {
        understanding: project.objective,
        firstAction: first?.title || "",
        how: first?.methodHint || "",
        doneWhen: first?.doneWhen || "",
      },
      tasks,
    },
  };
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: PLAN_CRITIC_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }],
      temperature: 0.1,
      max_tokens: 1800,
      ...(/deepseek/i.test(model) || /deepseek/i.test(baseUrl) ? { reasoning_effort: "none" } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`AI 请求失败：${response.status}`);
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(text);
  return { id: project.id, name: project.name, ...parsed };
}

const prisma = new PrismaClient();
const projects = await prisma.project.findMany({
  orderBy: { createdAt: "desc" },
  take: limit,
  select: {
    id: true, name: true, mode: true, objective: true, currentMilestone: true,
    tasks: { orderBy: { createdAt: "asc" }, select: { title: true, shortTitle: true, methodHint: true, doneWhen: true, executionMode: true, status: true, notes: true } },
  },
});
await prisma.$disconnect();

const reviews = await Promise.all(projects.map((project) => reviewOne(project)));
const failed = reviews.filter((review) => Number(review.score) < minScore);
console.log(`共审 ${reviews.length} 个项目，低于 ${minScore} 分：${failed.length}`);
for (const review of reviews) {
  console.log(`\n[${review.score}/10] ${review.name}`);
  console.log(review.verdict || "");
  for (const issue of review.issues || []) console.log("- " + issue);
  for (const item of review.rewriteInstructions || []) console.log("建议：" + item);
}
if (failed.length) process.exitCode = 1;