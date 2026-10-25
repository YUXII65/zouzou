/**
 * 把数据从 SOURCE_DATABASE_URL 复制到 TARGET_DATABASE_URL（用于把 Neon 换到更近的区域）。
 *
 * 用法：
 *   # 1. 先干跑，只看两边表数量（安全）
 *   SOURCE_DATABASE_URL="<旧库>" TARGET_DATABASE_URL="<新库>" node scripts/db-copy.mjs --dry-run
 *
 *   # 2. 真正复制（会先清空目标库的业务表，再按外键顺序写入）
 *   SOURCE_DATABASE_URL="<旧库>" TARGET_DATABASE_URL="<新库>" node scripts/db-copy.mjs --yes
 *
 * 前置条件：目标库已经跑过 `prisma migrate deploy`（表结构齐全）。
 * 注意：脚本只搬数据，不动结构；ID 原样保留，所以关联关系不会断。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--yes");

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error("缺少 SOURCE_DATABASE_URL / TARGET_DATABASE_URL");
  process.exit(1);
}
if (!dryRun && !confirmed) {
  console.error("真实写入需要显式加 --yes（先跑 --dry-run 看看数量）");
  process.exit(1);
}

// 按外键依赖顺序：先被引用的先写
const TABLES = [
  ["user", "users"],
  ["project", "projects"],
  ["inboxItem", "inbox_items"],
  ["projectStage", "project_stages"],
  ["projectTrack", "project_tracks"],
  ["task", "tasks"],
  ["taskStickyNote", "task_sticky_notes"],
  ["taskCheckinCompletion", "task_checkin_completions"],
  ["aiPlanFeedback", "ai_plan_feedbacks"],
  ["userPreference", "user_preferences"],
  ["aiFeedbackEvent", "ai_feedback_events"],
  ["review", "reviews"],
  ["reviewTask", "review_tasks"],
  ["reviewNextAction", "review_next_actions"],
  ["aiUsageLog", "ai_usage_logs"],
  ["usageEvent", "usage_events"],
];

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });
const tableName = (model) => model.charAt(0).toLowerCase() + model.slice(1);

async function main() {
  console.log("== 源库 ==");
  const rows = {};
  for (const [model, label] of TABLES) {
    rows[model] = await source[tableName(model)].findMany();
    console.log("  " + label + ": " + rows[model].length);
  }

  console.log("== 目标库（当前）==");
  for (const [model, label] of TABLES) {
    const count = await target[tableName(model)].count();
    console.log("  " + label + ": " + count);
  }

  if (dryRun) {
    console.log("\n干跑结束，没有写入。确认数量后加 --yes 真正执行。");
    return;
  }

  console.log("\n开始写入目标库…");
  // 先删后写，避免唯一约束冲突（顺序与外键相反）
  for (const [model] of [...TABLES].reverse()) {
    await target[tableName(model)].deleteMany({});
  }
  // projects.createdFromInboxItemId -> inbox_items，而 inbox_items.projectId -> projects，
  // 这是一组循环外键。所以写 project 时先把 createdFromInboxItemId 置空，
  // 等 inbox_items 写完之后再回填（回填数量很少，逐条 update 就够）。
  const projectSelfFk = rows.project
    .filter((row) => row.createdFromInboxItemId)
    .map((row) => ({
      id: row.id,
      createdFromInboxItemId: row.createdFromInboxItemId,
    }));

  for (const [model, label] of TABLES) {
    const list = rows[model];
    if (!list.length) continue;
    const data =
      model === "project"
        ? list.map((row) => ({ ...row, createdFromInboxItemId: null }))
        : list;
    for (let i = 0; i < data.length; i += 200) {
      await target[tableName(model)].createMany({
        data: data.slice(i, i + 200),
      });
    }
    console.log("  写入 " + label + ": " + list.length);

    if (model === "inboxItem" && projectSelfFk.length) {
      for (const row of projectSelfFk) {
        await target.project.update({
          where: { id: row.id },
          data: { createdFromInboxItemId: row.createdFromInboxItemId },
        });
      }
      console.log("  回填 projects.createdFromInboxItemId: " + projectSelfFk.length);
    }
  }

  console.log("\n== 校验 ==");
  let ok = true;
  for (const [model, label] of TABLES) {
    const before = rows[model].length;
    const after = await target[tableName(model)].count();
    const same = before === after;
    if (!same) ok = false;
    console.log("  " + label + ": 源 " + before + " / 新 " + after + (same ? " ✓" : " ✗"));
  }
  if (projectSelfFk.length) {
    const missing = await target.project.count({
      where: { createdFromInboxItemId: null, id: { in: projectSelfFk.map((r) => r.id) } },
    });
    if (missing) {
      ok = false;
      console.log("  projects.createdFromInboxItemId 还有 " + missing + " 条没回填 ✗");
    } else {
      console.log("  projects.createdFromInboxItemId 回填完整 ✓");
    }
  }
  console.log(ok ? "\n全部一致。" : "\n有表数量不一致，先别切！");
}

main()
  .catch((error) => {
    console.error("失败：" + (error?.message ?? error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
