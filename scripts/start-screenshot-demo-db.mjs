import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "xiaohongshu-recruitment-real");
fs.mkdirSync(outDir, { recursive: true });
const requestedPort = Number(process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1] || 55432);

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

if (!(await isPortFree(requestedPort))) throw new Error(`Port ${requestedPort} is already in use`);

const ddl = spawnSync(process.execPath, [
  "node_modules/prisma/build/index.js",
  "migrate",
  "diff",
  "--from-empty",
  "--to-schema-datamodel",
  "prisma/schema.prisma",
  "--script",
], { cwd: root, encoding: "utf8" });
if (ddl.status !== 0) throw new Error(ddl.stderr || ddl.stdout || "Failed to generate schema DDL");

const db = await PGlite.create();
await db.exec(ddl.stdout);

const now = new Date();
const isoNow = now.toISOString();
const today = new Date(now);
today.setHours(0, 0, 0, 0);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const userId = randomUUID();
const projectId = randomUUID();
const doneTaskId = randomUUID();
const focusTaskId = randomUUID();
const secondTaskId = randomUUID();
const thirdTaskId = randomUUID();
const feedbackTaskId = randomUUID();
const reviewId = randomUUID();
const stickyId = randomUUID();
await db.query(
  `INSERT INTO "users" ("id", "username", "passwordHash", "displayName", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [userId, "demo_story", "demo:not-used", "林序", new Date(now.getTime() - 6 * 86400000).toISOString(), isoNow],
);

await db.query(
  `INSERT INTO "projects" ("id", "userId", "name", "objective", "status", "currentMilestone", "notes", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  [projectId, userId, "个人成长账号", "做一个可持续更新的内容账号，先稳定发出前三条真实内容。", "active", "本周发出第一条，拿到一次真实反馈", "不再等完整方案，先用现有素材发出第一版。", isoNow, isoNow],
);

const taskColumns = `("id", "userId", "title", "shortTitle", "notes", "projectId", "status", "priority", "scheduledDate", "dueDate", "focusDate", "completedAt", "executionMode", "doneWhen", "maxTurns", "toolPolicy", "planOrder", "createdAt", "updatedAt")`;

async function insertTask(task) {
  await db.query(
    `INSERT INTO "tasks" ${taskColumns}
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [task.id, userId, task.title, task.shortTitle, task.notes, projectId, task.status, task.priority, task.scheduledDate, task.dueDate ?? null, task.focusDate ?? null, task.completedAt ?? null, task.executionMode, task.doneWhen, task.maxTurns, task.toolPolicy, task.planOrder, isoNow, isoNow],
  );
}

await insertTask({ id: doneTaskId, title: "确定账号只聊个人成长和真实推进", shortTitle: "确定账号内容边界", notes: "不再把效率、读书、生活全都放进来。", status: "done", priority: "medium", scheduledDate: yesterday.toISOString(), completedAt: yesterday.toISOString(), executionMode: "quick", doneWhen: "写下一句明确的内容边界", maxTurns: 1, toolPolicy: "none", planOrder: 0 });
await insertTask({ id: focusTaskId, title: "写下第一条内容的开头，并按这一版发布", shortTitle: "发出第一条内容", notes: "素材已经够了，我总想让开头一次到位。先写一个能发的版本，不再反复推翻。", status: "in_progress", priority: "high", scheduledDate: today.toISOString(), dueDate: today.toISOString(), focusDate: today.toISOString(), executionMode: "produce", doneWhen: "开头定稿并发布第一条内容", maxTurns: 2, toolPolicy: "none", planOrder: 1 });
await insertTask({ id: secondTaskId, title: "从已有素材里挑出 3 个能连续发的选题", shortTitle: "挑出前三个选题", notes: "只从已经记录过的素材里选，不额外找新方向。", status: "todo", priority: "medium", scheduledDate: tomorrow.toISOString(), executionMode: "quick", doneWhen: "列出 3 个具体选题", maxTurns: 1, toolPolicy: "none", planOrder: 2 });
await insertTask({ id: thirdTaskId, title: "把发布后的真实反馈记进复盘，再决定第二条", shortTitle: "根据反馈写第二条", notes: "先看评论和私信里真正有人回应的是什么，不凭感觉调整。", status: "todo", priority: "high", scheduledDate: tomorrow.toISOString(), executionMode: "explore", doneWhen: "记录一条反馈并据此定下第二条内容", maxTurns: 3, toolPolicy: "read", planOrder: 3 });
await insertTask({ id: feedbackTaskId, title: "记录第一条内容收到的真实反馈", shortTitle: "记录第一条反馈", notes: "先看哪些表达真的让人停下来回复。", status: "todo", priority: "high", scheduledDate: tomorrow.toISOString(), executionMode: "explore", doneWhen: "写下至少一条真实反馈和它对第二条内容的影响", maxTurns: 3, toolPolicy: "read", planOrder: 4 });
await db.query(
  `INSERT INTO "task_sticky_notes" ("id", "userId", "taskId", "sourceMessage", "title", "encouragement", "stepsJson", "nextStep", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
  [stickyId, userId, focusTaskId, "这个任务我还没有头绪，请给我一个能直接开始的行动方案", "先写一版，不要先改版", "你卡住的不是表达，是“必须一次写好”的要求。先把开头写到能发，再根据真实反应调整。", JSON.stringify(["打开最近一条素材，圈出一句最想说的话", "围绕这句话写 150 字，不回头看措辞", "停 5 分钟，只改错字和明显不顺的句子", "把这一版发出去，并记下发布时间"]), "先圈出一句最想说的话，限时 3 分钟。", isoNow, isoNow],
);

await db.query(
  `INSERT INTO "reviews" ("id", "userId", "reviewDate", "summary", "nextActions", "status", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [reviewId, userId, today.toISOString(), "今天没有继续重写开头，先发了第一版。比起再准备一轮，终于有了可以拿出去看的真实内容。", "明天记录第一条内容收到的真实反馈\n按反馈写第二条开头", "final", isoNow, isoNow],
);

async function insertReviewTask(taskId, title, status, priority) {
  await db.query(
    `INSERT INTO "review_tasks" ("id", "userId", "reviewId", "taskId", "projectId", "titleAtReview", "statusAtReview", "priorityAtReview", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomUUID(), userId, reviewId, taskId, projectId, title, status, priority, isoNow],
  );
}

await insertReviewTask(doneTaskId, "确定账号只聊个人成长和真实推进", "done", "medium");
await insertReviewTask(focusTaskId, "写下第一条内容的开头，并按这一版发布", "done", "high");
await insertReviewTask(secondTaskId, "从已有素材里挑出 3 个能连续发的选题", "todo", "medium");

await db.query(
  `INSERT INTO "review_next_actions" ("id", "userId", "reviewId", "title", "status", "sortOrder", "taskId", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  [randomUUID(), userId, reviewId, "记录第一条内容收到的真实反馈", "pending", 0, feedbackTaskId, isoNow, isoNow],
);
await db.query(
  `INSERT INTO "review_next_actions" ("id", "userId", "reviewId", "title", "status", "sortOrder", "taskId", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  [randomUUID(), userId, reviewId, "根据反馈改写第二条开头", "pending", 1, null, isoNow, isoNow],
);
await db.query(
  `INSERT INTO "user_preferences" ("id", "userId", "key", "value", "source", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [randomUUID(), userId, "first_run_tour", "done", "onboarding", isoNow, isoNow],
);
await db.query(
  `INSERT INTO "user_preferences" ("id", "userId", "key", "value", "source", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [randomUUID(), userId, "ai_execution_style", "先做一版能拿出手的，不反复优化", "manual", isoNow, isoNow],
);

const server = new PGLiteSocketServer({ db, port: requestedPort, host: "127.0.0.1" });
await server.start();

const secret = process.env.AUTH_SECRET || "screenshot-demo-secret";
const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
const payload = `${userId}.${expiresAt}`;
const signature = createHmac("sha256", secret).update(payload).digest("base64url");
const sessionToken = `${payload}.${signature}`;

fs.writeFileSync(path.join(outDir, "demo-meta.json"), JSON.stringify({ port: requestedPort, userId, projectId, sessionToken }, null, 2), "utf8");
console.log(`Screenshot demo database ready at 127.0.0.1:${requestedPort}`);
console.log("User: demo_story");
console.log("Press Ctrl+C to stop.");

async function shutdown() {
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 60_000);

