/**
 * 走走数据库备份（PostgreSQL / Neon）
 *
 * 旧版本这个脚本复制的是 prisma/dev.db —— 那是 SQLite 时代的遗留文件。
 * 数据库切到 Neon 之后它仍然"成功"运行，实际备份的是一份早已作废的库里文件，
 * 属于最坏的一种失败：看起来有备份，其实没有。
 *
 * 现在改成走 Prisma 做逻辑导出：不依赖 pg_dump，本机和 CI 都能跑，写完立刻校验。
 *
 * 用法：
 *   node scripts/backup-db.mjs                 # 备份到 backups/，保留最近 30 份
 *   node scripts/backup-db.mjs --keep=7        # 只保留最近 7 份
 *   node scripts/backup-db.mjs --out=some.gz   # 指定输出路径（不触发清理）
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  DUMP_FORMAT,
  DUMP_VERSION,
  TABLES,
  assertPostgres,
  describeSource,
} from "./lib/db-tables.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = path.join(root, "backups");
const BATCH_SIZE = 500;
const DEFAULT_KEEP = 30;
const FILE_PREFIX = "zouzou-dump-";

function argValue(name, fallback = null) {
  const hit = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

/** 用游标翻页，避免单表变大时一次性把全部行读进内存 */
async function fetchAll(delegate) {
  const rows = [];
  let cursor = null;

  for (;;) {
    const batch = await delegate.findMany({
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    rows.push(...batch);
    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }

  return rows;
}

async function collectDump(databaseUrl) {
  const prisma = new PrismaClient();
  const data = {};
  const counts = {};

  try {
    for (const table of TABLES) {
      const rows = await fetchAll(prisma[table.delegate]);
      data[table.name] = rows;
      counts[table.name] = rows.length;
    }
  } finally {
    await prisma.$disconnect();
  }

  return {
    format: DUMP_FORMAT,
    version: DUMP_VERSION,
    createdAt: new Date().toISOString(),
    source: describeSource(databaseUrl),
    totalRows: Object.values(counts).reduce((sum, n) => sum + n, 0),
    counts,
    data,
  };
}

/** 写完立刻回读：解不开或行数对不上的备份，等于没备份 */
async function verifyDumpFile(filePath, expected) {
  const parsed = JSON.parse(gunzipSync(await fs.readFile(filePath)).toString("utf8"));

  if (parsed.format !== DUMP_FORMAT) {
    throw new Error(`备份格式不符：${parsed.format}`);
  }
  if (parsed.version !== DUMP_VERSION) {
    throw new Error(`备份版本不符：${parsed.version}`);
  }
  for (const [name, count] of Object.entries(expected.counts)) {
    const actual = parsed.data?.[name]?.length ?? -1;
    if (actual !== count) {
      throw new Error(`表 ${name} 行数不一致：期望 ${count}，实际 ${actual}`);
    }
  }

  return parsed;
}

/** 只清理本脚本自己产出的备份，绝不碰 backups/ 里遗留的 .db 文件 */
async function prune(keep) {
  if (!Number.isFinite(keep) || keep < 1) return;

  const entries = (await fs.readdir(backupDir))
    .filter((name) => name.startsWith(FILE_PREFIX) && name.endsWith(".json.gz"))
    .sort();

  for (const name of entries.slice(0, Math.max(0, entries.length - keep))) {
    await fs.unlink(path.join(backupDir, name));
    console.log(`清理旧备份：${name}`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  assertPostgres(databaseUrl);

  const dump = await collectDump(databaseUrl);

  await fs.mkdir(backupDir, { recursive: true });
  const explicitOut = argValue("out");
  const outPath = explicitOut
    ? path.resolve(root, explicitOut)
    : path.join(backupDir, `${FILE_PREFIX}${timestamp()}.json.gz`);

  await fs.writeFile(outPath, gzipSync(JSON.stringify(dump)));
  await verifyDumpFile(outPath, dump);

  const sizeKb = Math.round((await fs.stat(outPath)).size / 1024);
  console.log(`备份完成：${path.relative(root, outPath)}（${sizeKb} KB，已校验）`);
  console.log(
    `表数 ${TABLES.length}，总行数 ${dump.totalRows}：` +
      Object.entries(dump.counts)
        .filter(([, n]) => n > 0)
        .map(([name, n]) => `${name}=${n}`)
        .join(" "),
  );

  if (!explicitOut) {
    await prune(Number(argValue("keep", String(DEFAULT_KEEP))));
  }
}

main().catch((error) => {
  console.error(`备份失败：${error.message}`);
  process.exit(1);
});
