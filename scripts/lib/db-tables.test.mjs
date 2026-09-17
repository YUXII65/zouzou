import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REFERENCES,
  TABLES,
  buildRestorePlan,
  checkReferentialIntegrity,
  normalizeDatabaseUrl,
} from "./db-tables.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * 这组测试盯的是「备份校验器本身」。
 * 旧备份脚本的教训是：不报错的东西不等于做对了。校验器如果漏掉一个外键，
 * 备份文件依然是"校验通过"，出事时才发现恢复不了。
 */

test("REFERENCES 与 prisma/schema.prisma 里的外键一一对应", () => {
  const schema = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");

  // 只认带 fields: [...] 的那一侧，反向关系没有真实列
  const fromSchema = new Map();
  for (const model of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, modelName, body] = model;
    for (const line of body.split("\n")) {
      const hit = line.match(
        /^\s*(\w+)\s+(\w+)(\?)?\s+.*@relation\([^)]*fields:\s*\[([^\]]+)\]/,
      );
      if (!hit) continue;
      const [, , targetType, optional, fields] = hit;
      const column = fields.split(",")[0].trim();
      fromSchema.set(`${modelName}.${column}`, {
        target: targetType,
        nullable: Boolean(optional),
      });
    }
  }

  const declared = new Map(
    REFERENCES.map(([spec, target, , nullable]) => [spec, { target, nullable }]),
  );

  assert.deepEqual(
    [...declared.keys()].filter((key) => !fromSchema.has(key)),
    [],
    "REFERENCES 里有 schema 中不存在的外键",
  );
  assert.deepEqual(
    [...fromSchema.keys()].filter((key) => !declared.has(key)),
    [],
    "schema 里有未纳入校验的外键 —— 备份校验会漏掉它",
  );

  for (const [spec, expected] of fromSchema) {
    assert.deepEqual(
      declared.get(spec),
      expected,
      `${spec} 的目标表或可空性与 schema 不一致`,
    );
  }
});

function dump(overrides = {}) {
  return {
    data: {
      User: [{ id: "u1" }],
      Project: [{ id: "p1", userId: "u1", createdFromInboxItemId: null }],
      InboxItem: [{ id: "i1", userId: "u1", projectId: "p1" }],
      Task: [{ id: "t1", userId: "u1", projectId: "p1", inboxItemId: "i1" }],
      Review: [{ id: "r1", userId: "u1" }],
      ...overrides,
    },
  };
}

test("自洽的备份不报问题", () => {
  assert.deepEqual(checkReferentialIntegrity(dump()), []);
});

test("指向不存在行的外键会被抓出来", () => {
  const problems = checkReferentialIntegrity(
    dump({ Task: [{ id: "t1", userId: "u1", projectId: "不存在", inboxItemId: null }] }),
  );
  assert.ok(
    problems.some((issue) => issue.includes("Task.projectId") && issue.includes("不存在")),
    `实际输出：${JSON.stringify(problems)}`,
  );
});

test("必填外键为空会被抓出来", () => {
  const problems = checkReferentialIntegrity(
    dump({ Project: [{ id: "p1", userId: null, createdFromInboxItemId: null }] }),
  );
  assert.ok(
    problems.some((issue) => issue.includes("Project.userId") && issue.includes("必填")),
    `实际输出：${JSON.stringify(problems)}`,
  );
});

test("可空外键留空是合法的", () => {
  const problems = checkReferentialIntegrity(
    dump({ Task: [{ id: "t1", userId: "u1", projectId: null, inboxItemId: null }] }),
  );
  assert.deepEqual(problems, []);
});

test("缺少某张表时按空表处理，不抛异常", () => {
  // 空表没有行可违反约束，所以这里不该报外键问题；
  // 「整张表不见了」由 restore-db.mjs 的行数比对负责，两边职责分开。
  assert.deepEqual(checkReferentialIntegrity({ data: {} }), []);
  assert.deepEqual(checkReferentialIntegrity({}), []);
});

test("dump 为 undefined 也不崩", () => {
  assert.ok(Array.isArray(checkReferentialIntegrity(undefined)));
});

/* ---------- 恢复计划 ---------- */

function planDump() {
  return {
    data: {
      User: [{ id: "u1" }],
      Project: [
        { id: "p1", userId: "u1", createdFromInboxItemId: "i1" },
        { id: "p2", userId: "u1", createdFromInboxItemId: null },
      ],
      InboxItem: [{ id: "i1", userId: "u1", projectId: "p1" }],
      Task: [{ id: "t1", userId: "u1", projectId: "p1", inboxItemId: "i1" }],
    },
  };
}

test("恢复计划覆盖每张表恰好一次", () => {
  const plan = buildRestorePlan(planDump());
  const created = plan.phases.filter((p) => p.kind === "create").map((p) => p.table);
  assert.deepEqual([...created].sort(), TABLES.map((t) => t.name).sort());
  assert.equal(new Set(created).size, created.length);
});

test("清空顺序是写入顺序的反向", () => {
  const plan = buildRestorePlan(planDump());
  assert.deepEqual(plan.clearOrder, [...TABLES].map((t) => t.name).reverse());
});

test("Project 在建 InboxItem 之前写入，且自环外键置空", () => {
  const plan = buildRestorePlan(planDump());
  const order = plan.phases.map((p) => (p.kind === "create" ? p.table : p.kind));
  assert.ok(order.indexOf("Project") < order.indexOf("InboxItem"));

  const projectPhase = plan.phases.find((p) => p.table === "Project");
  assert.deepEqual(
    projectPhase.rows.map((row) => row.createdFromInboxItemId),
    [null, null],
  );
});

test("回填排在 Project/InboxItem 之后、Task 之前", () => {
  const plan = buildRestorePlan(planDump());
  const order = plan.phases.map((p) => (p.kind === "create" ? p.table : p.kind));
  const backfillAt = order.indexOf("backfillProjectFromInbox");
  assert.ok(backfillAt > order.indexOf("InboxItem"));
  assert.ok(backfillAt < order.indexOf("Task"));
});

test("只回填非空的 createdFromInboxItemId", () => {
  const plan = buildRestorePlan(planDump());
  const backfill = plan.phases.find((p) => p.kind === "backfillProjectFromInbox");
  assert.deepEqual(backfill.rows, [
    { id: "p1", createdFromInboxItemId: "i1", updatedAt: undefined },
  ]);
});

test("生成计划不修改传入的 dump", () => {
  const dump = planDump();
  buildRestorePlan(dump);
  assert.equal(
    dump.data.Project[0].createdFromInboxItemId,
    "i1",
    "传入的 dump 被改写了，重复调用会丢掉回填信息",
  );
});

test("空 dump 不崩，且仍给出完整表清单", () => {
  const plan = buildRestorePlan({ data: {} });
  assert.deepEqual(plan.phases.find((p) => p.kind === "backfillProjectFromInbox").rows, []);
  assert.equal(plan.phases.filter((p) => p.kind === "create").length, TABLES.length);
  assert.deepEqual(buildRestorePlan(undefined).clearOrder, plan.clearOrder);
});

/* ---------- 连接串归一化 ---------- */

test("连接串的引号与首尾空白会被去掉", () => {
  const url = "postgresql://u:p@host.neon.tech/db";
  assert.equal(normalizeDatabaseUrl(url), url);
  assert.equal(normalizeDatabaseUrl(`"${url}"`), url);
  assert.equal(normalizeDatabaseUrl(`'${url}'`), url);
  assert.equal(normalizeDatabaseUrl(`  ${url}  `), url);
  assert.equal(normalizeDatabaseUrl(` "${url}" `), url);
});

test("空值与非字符串返回空串", () => {
  assert.equal(normalizeDatabaseUrl(undefined), "");
  assert.equal(normalizeDatabaseUrl(null), "");
  assert.equal(normalizeDatabaseUrl(42), "");
  assert.equal(normalizeDatabaseUrl("   "), "");
});
