/**
 * 数据表清单：备份、校验、恢复三处共用一份定义，避免顺序或字段写法漂移。
 *
 * - delegate：Prisma Client 上的属性名
 * - dates：需要从 ISO 字符串还原成 Date 的字段（Prisma 读出来是 Date，JSON 落盘后是字符串）
 * - restorePhase：恢复时的写入批次，用来绕开外键依赖
 */
export const TABLES = [
  {
    name: "User",
    delegate: "user",
    dates: ["createdAt", "updatedAt"],
    restorePhase: 1,
  },
  {
    name: "Project",
    delegate: "project",
    dates: ["lastReviewedAt", "createdAt", "updatedAt"],
    // phase 2 先建项目（createdFromInboxItemId 置空），phase 4 再补这条自环外键
    restorePhase: 2,
  },
  {
    name: "InboxItem",
    delegate: "inboxItem",
    dates: [
      "dueDate",
      "aiAnalyzedAt",
      "confirmedAt",
      "processedAt",
      "createdAt",
      "updatedAt",
    ],
    restorePhase: 3,
  },
  {
    name: "Task",
    delegate: "task",
    dates: [
      "scheduledDate",
      "dueDate",
      "focusDate",
      "completedAt",
      "createdAt",
      "updatedAt",
    ],
    restorePhase: 5,
  },
  {
    name: "TaskStickyNote",
    delegate: "taskStickyNote",
    dates: ["createdAt", "updatedAt"],
    restorePhase: 6,
  },
  {
    name: "AiPlanFeedback",
    delegate: "aiPlanFeedback",
    dates: ["createdAt", "updatedAt"],
    restorePhase: 7,
  },
  {
    name: "UserPreference",
    delegate: "userPreference",
    dates: ["createdAt", "updatedAt"],
    restorePhase: 8,
  },
  {
    name: "AiFeedbackEvent",
    delegate: "aiFeedbackEvent",
    dates: ["createdAt"],
    restorePhase: 9,
  },
  {
    name: "Review",
    delegate: "review",
    dates: ["reviewDate", "createdAt", "updatedAt"],
    restorePhase: 10,
  },
  {
    name: "ReviewTask",
    delegate: "reviewTask",
    dates: ["createdAt"],
    restorePhase: 11,
  },
  {
    name: "ReviewNextAction",
    delegate: "reviewNextAction",
    dates: ["createdAt", "updatedAt"],
    restorePhase: 12,
  },
  {
    name: "AiUsageLog",
    delegate: "aiUsageLog",
    dates: ["createdAt"],
    restorePhase: 13,
  },
  {
    name: "UsageEvent",
    delegate: "usageEvent",
    dates: ["createdAt"],
    restorePhase: 14,
  },
];

export const DUMP_FORMAT = "zouzou-logical-dump";
export const DUMP_VERSION = 1;

/** Project 与 InboxItem 互相引用，恢复时必须先断掉这条自环 */
export const PROJECT_INBOX_BACKREF = "createdFromInboxItemId";

/**
 * 只保留连接信息里"能定位是哪套库"的部分，绝不写进密码。
 */
/** 从 .env 里直接复制过来的连接串通常带引号，先去掉再解析 */
export function normalizeDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== "string") return "";
  const trimmed = databaseUrl.trim();
  if (
    trimmed.length >= 2 &&
    (trimmed.startsWith('"') || trimmed.startsWith("'")) &&
    trimmed.endsWith(trimmed[0])
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function describeSource(databaseUrl) {
  const normalized = normalizeDatabaseUrl(databaseUrl);
  if (!normalized) return { provider: "postgresql", host: null, database: null };
  try {
    const url = new URL(normalized);
    return {
      provider: url.protocol.replace(":", ""),
      host: url.hostname,
      database: url.pathname.replace(/^\//, "") || null,
    };
  } catch {
    return { provider: "unknown", host: null, database: null };
  }
}

/** 备份脚本只认 PostgreSQL：早前的 SQLite 备份路径已经失效过一次，这里直接拦住 */
export function assertPostgres(databaseUrl) {
  const normalized = normalizeDatabaseUrl(databaseUrl);
  if (!normalized) {
    throw new Error("缺少 DATABASE_URL，无法备份。");
  }
  if (normalized.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL 指向本地 SQLite 文件，但当前 schema 是 PostgreSQL。请检查 .env。",
    );
  }
  if (!/^postgres(ql)?:\/\//.test(normalized)) {
    throw new Error(
      `无法识别的 DATABASE_URL 协议：${normalized.split(":")[0]}（连接串应以 postgresql:// 开头）`,
    );
  }
}

/**
 * 表间外键引用，用于恢复前的引用完整性校验。
 * 每一项是 [本表字段, 目标表, 目标字段]，nullable 表示该字段可以为空。
 */
export const REFERENCES = [
  ["Project.userId", "User", "id", false],
  ["Project.createdFromInboxItemId", "InboxItem", "id", true],
  ["InboxItem.userId", "User", "id", false],
  ["InboxItem.projectId", "Project", "id", true],
  ["Task.userId", "User", "id", false],
  ["Task.projectId", "Project", "id", true],
  ["Task.inboxItemId", "InboxItem", "id", true],
  ["TaskStickyNote.userId", "User", "id", false],
  ["TaskStickyNote.taskId", "Task", "id", false],
  ["AiPlanFeedback.userId", "User", "id", false],
  ["AiPlanFeedback.inboxItemId", "InboxItem", "id", true],
  ["UserPreference.userId", "User", "id", false],
  ["AiFeedbackEvent.userId", "User", "id", false],
  ["AiFeedbackEvent.inboxItemId", "InboxItem", "id", true],
  ["AiFeedbackEvent.taskId", "Task", "id", true],
  ["AiFeedbackEvent.projectId", "Project", "id", true],
  ["Review.userId", "User", "id", false],
  ["ReviewTask.userId", "User", "id", false],
  ["ReviewTask.reviewId", "Review", "id", false],
  ["ReviewTask.taskId", "Task", "id", false],
  ["ReviewTask.projectId", "Project", "id", true],
  ["ReviewNextAction.userId", "User", "id", false],
  ["ReviewNextAction.reviewId", "Review", "id", false],
  ["ReviewNextAction.taskId", "Task", "id", true],
  ["AiUsageLog.userId", "User", "id", false],
  ["UsageEvent.userId", "User", "id", false],
];

/** 恢复顺序：phase 2 先建 Project（自环外键置空），phase 4 再回填 */
export const PROJECT_BACKREF_PHASE = 4;

/**
 * 引用完整性检查：每个外键值都必须在同一份备份里找到对应行，必填外键不能为空。
 * 通过就说明这份备份自洽、可以按依赖顺序恢复。
 *
 * 抽成纯函数是为了能单测 —— 一个没被人验证过的校验器，
 * 和没有校验器的区别只在于更容易让人放心。
 */
export function checkReferentialIntegrity(dump) {
  const problems = [];

  for (const [spec, target, targetField, nullable] of REFERENCES) {
    const [table, field] = spec.split(".");
    const rows = dump?.data?.[table] ?? [];
    const ids = new Set(
      (dump?.data?.[target] ?? []).map((row) => row[targetField]),
    );

    let dangling = 0;
    let empty = 0;

    for (const row of rows) {
      const value = row[field];
      if (value === null || value === undefined) {
        if (!nullable) empty += 1;
        continue;
      }
      if (!ids.has(value)) dangling += 1;
    }

    if (dangling) {
      problems.push(`${spec} 有 ${dangling} 行指向不存在的 ${target}`);
    }
    if (empty) {
      problems.push(`${spec} 有 ${empty} 行必填外键为空`);
    }
  }

  return problems;
}

/** 按模型名查表定义 */
export const TABLES_BY_NAME = new Map(TABLES.map((table) => [table.name, table]));

/**
 * 把一份备份翻译成"按什么顺序写什么"的恢复计划。
 *
 * 单独抽出来是因为恢复最容易出错的地方不是 Prisma 调用，而是顺序：
 * Project.createdFromInboxItemId 和 InboxItem.projectId 互相引用，
 * 必须先建项目（该字段置空）→ 建收件箱条目 → 再回填。
 * 这段逻辑如果写错，只有真出事时才会发现，所以要有单测。
 */
export function buildRestorePlan(dump) {
  const data = dump?.data ?? {};

  const beforeBackref = TABLES.filter(
    (table) => table.restorePhase < PROJECT_BACKREF_PHASE,
  );
  const afterBackref = TABLES.filter(
    (table) => table.restorePhase > PROJECT_BACKREF_PHASE,
  );

  const projectRows = (data.Project ?? []).map((row) => ({
    ...row,
    createdFromInboxItemId: null,
  }));

  const backfillRows = (data.Project ?? [])
    .filter((row) => row.createdFromInboxItemId !== null && row.createdFromInboxItemId !== undefined)
    .map((row) => ({
      id: row.id,
      createdFromInboxItemId: row.createdFromInboxItemId,
      // 必须带上 updatedAt：回填走的是 update，而 Project.updatedAt 带 @updatedAt，
      // 不显式写回就会被刷成"现在"，破坏项目排序和停滞天数判断。
      updatedAt: row.updatedAt,
    }));

  return {
    // 清空顺序与写入顺序相反，避免先删被引用的行
    clearOrder: [...TABLES].reverse().map((table) => table.name),
    phases: [
      ...beforeBackref.map((table) => ({
        kind: "create",
        table: table.name,
        rows: table.name === "Project" ? projectRows : (data[table.name] ?? []),
      })),
      { kind: "backfillProjectFromInbox", rows: backfillRows },
      ...afterBackref.map((table) => ({
        kind: "create",
        table: table.name,
        rows: data[table.name] ?? [],
      })),
    ],
  };
}
