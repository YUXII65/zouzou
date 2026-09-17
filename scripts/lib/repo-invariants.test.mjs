import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * 仓库级不变量。
 *
 * 这些规则不是某段代码的行为，而是"整个项目不许再犯的错"。
 * 每一条都对应一个真实踩过的坑，不是假想的。
 */

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (full) => path.relative(root, full).replace(/\\/g, "/");

/* ------------------------------------------------------------------ *
 * 坑一：数据库从 SQLite 迁到 Postgres 之后，prisma/dev.db 还留在本机，
 * 于是"读 dev.db"的代码依然跑得通，只是读的是一份死文件。
 * 这个坑踩了两次：scripts/backup-db.mjs 和 src/app/api/backup/route.ts。
 * 部署环境里没有 dev.db（它没被 git 跟踪），所以这类代码线上必然 500。
 * ------------------------------------------------------------------ */
test("应用代码不再引用 SQLite 时代的 prisma/dev.db", () => {
  const offenders = walk(path.join(root, "src"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => fs.readFileSync(file, "utf8").includes("dev.db"))
    .map(rel);

  assert.deepEqual(
    offenders,
    [],
    `这些文件还在读 dev.db，部署环境里该文件并不存在：${offenders.join("、")}`,
  );
});

/* ------------------------------------------------------------------ *
 * 坑二：src/app/api/backup/route.ts 曾经是公开可访问的，而且没有鉴权 ——
 * 任何人不登录就能拉走整个数据库文件。旁边的 /api/export 是有鉴权的，
 * 说明这是漏写而不是有意设计。所以：路由要么显式鉴权，要么进白名单。
 * ------------------------------------------------------------------ */
const PUBLIC_ROUTES = new Set([
  // 健康检查：只返回 ok，失败时返回经过脱敏的错误信息；必须不依赖登录态
  "src/app/api/health/route.ts",
]);

const AUTH_HELPERS = ["requireUser", "getCurrentUser", "getAdminUser"];

function apiRoutes() {
  return walk(path.join(root, "src", "app", "api")).filter((file) =>
    file.endsWith(`${path.sep}route.ts`),
  );
}

test("每个 API 路由要么调用鉴权，要么在白名单里写明理由", () => {
  const unguarded = [];
  for (const file of apiRoutes()) {
    const name = rel(file);
    if (PUBLIC_ROUTES.has(name)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (!AUTH_HELPERS.some((helper) => text.includes(helper))) {
      unguarded.push(name);
    }
  }

  assert.deepEqual(
    unguarded,
    [],
    `这些路由没有任何鉴权调用：${unguarded.join("、")}。` +
      `如果确实要公开，加进本文件的 PUBLIC_ROUTES 并写清理由。`,
  );
});

test("白名单里的路由都真实存在（避免白名单名写错后失效）", () => {
  const existing = new Set(apiRoutes().map(rel));
  const stale = [...PUBLIC_ROUTES].filter((name) => !existing.has(name));
  assert.deepEqual(stale, [], `白名单里这些路径已经不存在：${stale.join("、")}`);
});

test("公开路由的数量被显式限制在最小集合内", () => {
  // 公开路由一旦变多，就应该有人重新读一遍这条测试，而不是默默放行。
  assert.ok(
    PUBLIC_ROUTES.size <= 1,
    `公开路由增加到 ${PUBLIC_ROUTES.size} 个，请确认这是有意为之`,
  );
});
