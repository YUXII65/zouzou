/**
 * 端到端验证「备份真的能恢复」。
 *
 * 背景：备份文件的自洽性（引用完整性）已经有测试覆盖，恢复的**顺序和自环外键处理**
 * 也有单测覆盖。但真正连到一个 Postgres、把 createMany / update 跑一遍这一步，
 * 一直只是"看起来很薄，应该没问题"。
 *
 * 这个脚本把这一步补上：用 PGlite（编译成 WASM 的真实 Postgres）起一个临时数据库，
 * 建好表之后，调用生产同一份 scripts/restore-db.mjs 做恢复，再逐表比对行数。
 *
 * 全程在内存里，不碰任何真实数据库。
 *
 * 用法：
 *   node scripts/verify-restore.mjs                      # 用 backups/ 里最新一份
 *   node scripts/verify-restore.mjs --file=backups/x.json.gz
 *   node scripts/verify-restore.mjs --fixture     # 用内置小样本，适合 CI
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { TABLES } from "./lib/db-tables.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = path.join(root, "backups");
const FILE_PREFIX = "zouzou-dump-";
/** 让系统分配一个空闲端口；写死端口在 CI 上可能撞车 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
const fileArg = process.argv
  .slice(2)
  .find((a) => a.startsWith("--file="))
  ?.split("=")[1];

/**
 * 异步执行子进程。
 *
 * 这里不能用 spawnSync：PGlite 的 socket 服务跑在当前进程里，
 * spawnSync 会把事件循环整个卡住，服务端就无法响应连接 ——
 * 表现为 TCP 已经连上，但 Prisma 报 "Can't reach database server"。
 */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ status: -1, stdout, stderr: String(error.message) }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function latestBackupPath() {
  const entries = fs
    .readdirSync(backupDir)
    .filter((n) => n.startsWith(FILE_PREFIX) && n.endsWith(".json.gz"))
    .sort();
  if (!entries.length) throw new Error("backups/ 下没有备份文件，先跑 pnpm db:backup");
  return path.join(backupDir, entries[entries.length - 1]);
}

/** 用 Prisma 自己把 schema 转成建表 SQL，避免手写 DDL 和 schema 漂移 */
function schemaDdl() {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`生成建表 SQL 失败：${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

/** 把一行规范化成可比较的字符串：Date 转 ISO，键排序 */
function canonical(row) {
  const normalized = {};
  for (const key of Object.keys(row).sort()) {
    const value = row[key];
    normalized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return JSON.stringify(normalized);
}

async function main() {
  const useFixture = process.argv.slice(2).includes("--fixture");

  let dump;
  let label;
  let restoreTarget;

  if (useFixture) {
    // 小样本：覆盖自环外键回填、可空外键、以及 13 张表各至少一行。
    // 这样 CI 不需要真实备份文件也能跑完整恢复流程。
    const fixturePath = path.join(root, "scripts", "fixtures", "restore-roundtrip.json");
    dump = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    label = `内置样本（${path.relative(root, fixturePath)}）`;
    // 恢复脚本要读文件，所以把样本落到临时文件
    restoreTarget = path.join(root, "backups", ".fixture-restore-check.json.gz");
    fs.mkdirSync(path.dirname(restoreTarget), { recursive: true });
    fs.writeFileSync(
      restoreTarget,
      gzipSync(Buffer.from(JSON.stringify(dump), "utf8")),
    );
  } else {
    const backupPath = fileArg ? path.resolve(root, fileArg) : latestBackupPath();
    dump = JSON.parse(gunzipSync(fs.readFileSync(backupPath)).toString("utf8"));
    restoreTarget = backupPath;
    label = path.relative(root, backupPath);
  }

  console.log(`数据来源：${label}（${dump.totalRows} 行）`);

  // 先算好建表 SQL：这一步是阻塞的，必须放在起服务之前
  const ddl = schemaDdl();

  const PORT = await freePort();

  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
  await server.start();
  console.log(`临时 Postgres 已启动：127.0.0.1:${PORT}（PGlite，内存）`);

  try {
    await db.exec(ddl);
    console.log("建表完成");

    // 用生产同一份恢复脚本，而不是在这里重写一遍恢复逻辑
    const url = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;
    const restore = await run(
      process.execPath,
      ["scripts/restore-db.mjs", `--file=${path.relative(root, restoreTarget)}`, `--into=${url}`, "--yes"],
      { cwd: root },
    );

    if (restore.status !== 0) {
      console.error(restore.stdout);
      console.error(restore.stderr);
      throw new Error(`恢复脚本以退出码 ${restore.status} 结束`);
    }
    console.log(restore.stdout.trim());

    // 逐表比对：数据库里真的有哪些行
    // pgbouncer=true 让 Prisma 不用命名预处理语句。
    // PGlite 的 socket 实现是单会话复用的，连接之间不会清理 prepared statement，
    // 第二个连接再发同名语句就会撞 42P05。这个开关只影响这条校验连接，
    // 不改变被验证的恢复路径（恢复脚本用的是它自己的连接）。
    const prisma = new PrismaClient({
      datasources: { db: { url: `${url}?pgbouncer=true` } },
    });
    const problems = [];
    try {
      for (const table of TABLES) {
        const expectedRows = dump.data?.[table.name] ?? [];

        // 第一层：行数
        const actual = await prisma[table.delegate].count();
        if (actual !== expectedRows.length) {
          problems.push(
            `${table.name}: 期望 ${expectedRows.length} 行，库里实际 ${actual} 行`,
          );
          continue;
        }

        // 第二层：逐行逐字段。
        // 只比行数会漏掉"顺序对了但内容没写进去"的情况 ——
        // 比如 Project.createdFromInboxItemId 的回填如果静默失败，行数依然一致。
        const actualRows = await prisma[table.delegate].findMany();
        const expectedSet = new Set(expectedRows.map(canonical));
        const actualSet = new Set(actualRows.map(canonical));

        const missing = [...expectedSet].filter((row) => !actualSet.has(row));
        const extra = [...actualSet].filter((row) => !expectedSet.has(row));

        if (missing.length) {
          problems.push(
            `${table.name}: 有 ${missing.length} 行内容与备份不一致，例如 ${missing[0].slice(0, 120)}`,
          );
        }
        if (extra.length) {
          problems.push(
            `${table.name}: 库里多出 ${extra.length} 行未出现在备份中，例如 ${extra[0].slice(0, 120)}`,
          );
        }
      }
    } finally {
      await prisma.$disconnect();
    }

    if (problems.length) {
      console.error("\n恢复后行数不一致：");
      for (const p of problems) console.error(`  - ${p}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `\n恢复验证通过：${TABLES.length} 张表、${dump.totalRows} 行逐字段比对一致。`,
    );
  } finally {
    await server.stop();
    await db.close();
    fs.rmSync(path.join(root, "backups", ".fixture-restore-check.json.gz"), {
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(`验证失败：${error.message}`);
  process.exitCode = 1;
});
