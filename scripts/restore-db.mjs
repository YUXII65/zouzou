/**
 * 走走数据库备份的校验与恢复
 *
 * 默认只做校验（不写任何数据库）：
 *   1. 格式、版本、各表行数
 *   2. 引用完整性 —— 每个外键值都能在同一个备份里找到对应行
 *   3. 必填外键不是空值
 * 引用完整性通过，就说明这份备份是自洽、可恢复的。
 *
 * 真正写库要显式给两个参数：
 *   node scripts/restore-db.mjs --into="postgresql://..." --yes
 *
 * 用法：
 *   node scripts/restore-db.mjs                     # 校验 backups/ 里最新一份
 *   node scripts/restore-db.mjs --file=xxx.json.gz  # 校验指定文件
 *   node scripts/restore-db.mjs --into=... --yes    # 恢复到目标库（会清空目标库同名表）
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  DUMP_FORMAT,
  DUMP_VERSION,
  TABLES,
  TABLES_BY_NAME,
  assertPostgres,
  buildRestorePlan,
  checkReferentialIntegrity,
  describeSource,
} from "./lib/db-tables.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = path.join(root, "backups");
const FILE_PREFIX = "zouzou-dump-";

function argValue(name, fallback = null) {
  const hit = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const hasFlag = (name) => process.argv.slice(2).includes(`--${name}`);

async function latestBackupPath() {
  const entries = (await fs.readdir(backupDir))
    .filter((name) => name.startsWith(FILE_PREFIX) && name.endsWith(".json.gz"))
    .sort();
  if (!entries.length) {
    throw new Error(`backups/ 下没有找到 ${FILE_PREFIX}*.json.gz，请先运行 pnpm db:backup。`);
  }
  return path.join(backupDir, entries[entries.length - 1]);
}

async function readDump(filePath) {
  return JSON.parse(gunzipSync(await fs.readFile(filePath)).toString("utf8"));
}

function reportDump(dump, filePath) {
  const lines = [
    `文件：${path.relative(root, filePath)}`,
    `格式：${dump.format} v${dump.version}`,
    `导出时间：${dump.createdAt}`,
    `来源：${dump.source?.host ?? "未知"}/${dump.source?.database ?? "未知"}`,
    "各表行数：",
    ...TABLES.map((table) => {
      const expected = dump.counts?.[table.name];
      const actual = dump.data?.[table.name]?.length ?? -1;
      const flag = expected === actual ? "" : `  ← 与记录不符（记录 ${expected}）`;
      return `  ${table.name}: ${actual}${flag}`;
    }),
  ];
  console.log(lines.join("\n"));
}

async function verify(filePath) {
  const dump = await readDump(filePath);

  if (dump.format !== DUMP_FORMAT) {
    throw new Error(`备份格式不符：${dump.format}`);
  }
  if (dump.version !== DUMP_VERSION) {
    throw new Error(`备份版本不符：${dump.version}`);
  }

  reportDump(dump, filePath);

  const countProblems = TABLES.filter(
    (table) =>
      (dump.counts?.[table.name] ?? -1) !== (dump.data?.[table.name]?.length ?? -2),
  ).map((table) => `${table.name} 行数与记录不符`);

  const refProblems = checkReferentialIntegrity(dump);
  const problems = [...countProblems, ...refProblems];

  if (problems.length) {
    console.error(`\n校验未通过：`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log(`\n校验通过：13 张表引用完整，共 ${dump.totalRows} 行。`);
}

async function restore(filePath, targetUrl) {
  assertPostgres(targetUrl);
  const dump = await readDump(filePath);

  // 顺序与自环外键的处理都放在 buildRestorePlan 里，那边有单测覆盖。
  const plan = buildRestorePlan(dump);

  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  let written = 0;

  try {
    // 目标库可能已有数据；不清理会撞唯一约束。按与写入相反的顺序删。
    for (const name of plan.clearOrder) {
      const table = TABLES_BY_NAME.get(name);
      await prisma[table.delegate].deleteMany({});
    }

    for (const phase of plan.phases) {
      if (phase.kind === "create") {
        if (!phase.rows.length) continue;
        const table = TABLES_BY_NAME.get(phase.table);
        await prisma[table.delegate].createMany({ data: phase.rows });
        written += phase.rows.length;
        console.log(`恢复 ${phase.table}：${phase.rows.length} 行`);
        continue;
      }

      for (const item of phase.rows) {
        await prisma.project.update({
          where: { id: item.id },
          data: {
            createdFromInboxItemId: item.createdFromInboxItemId,
            // 显式写回：否则 @updatedAt 会把它刷成恢复时刻
            ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
          },
        });
      }
      if (phase.rows.length) {
        console.log(`回填 Project.createdFromInboxItemId：${phase.rows.length} 行`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n恢复完成：${written} 行写入目标库。`);
}

async function main() {
  const filePath = argValue("file")
    ? path.resolve(root, argValue("file"))
    : await latestBackupPath();
  const targetUrl = argValue("into");

  if (!targetUrl) {
    await verify(filePath);
    return;
  }

  if (!hasFlag("yes")) {
    console.error(
      "恢复会清空目标库里的同名表。确认无误后加上 --yes 再执行：\n" +
        `  node scripts/restore-db.mjs --file="${path.relative(root, filePath)}" --into="<目标库连接串>" --yes`,
    );
    process.exit(1);
  }

  // 比 host + 库名而不是比字符串：从 .env 复制过来的连接串可能带引号或参数顺序不同
  const target = describeSource(targetUrl);
  const source = describeSource(process.env.DATABASE_URL);
  if (
    source.host &&
    target.host === source.host &&
    target.database === source.database
  ) {
    console.error(
      `拒绝把备份恢复到源库本身（${target.host}/${target.database}）。请显式换一个目标库。`,
    );
    process.exit(1);
  }

  await restore(filePath, targetUrl);
}

main().catch((error) => {
  console.error(`失败：${error.message}`);
  process.exit(1);
});
