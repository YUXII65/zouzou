import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

const RETRYABLE_PRISMA_CODES = new Set([
  "P1001",
  "P1017",
  "P2024",
  "P2028",
  "P2034",
]);
const RETRYABLE_MESSAGE_PATTERN =
  /terminating connection due to administrator command|can't reach database server|please make sure the database server is running|transaction already closed|connection.*(?:closed|reset)|ECONNRESET|server closed the connection/i;

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code ?? "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableConnectionError(error: unknown) {
  return (
    RETRYABLE_PRISMA_CODES.has(errorCode(error)) ||
    RETRYABLE_MESSAGE_PATTERN.test(errorMessage(error))
  );
}

function isReadOperation(operation: string) {
  return /^(find|count|aggregate|groupBy)/.test(operation);
}

async function retryConnection<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectionError(error) || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 350 * 2 ** (attempt - 1)),
      );
    }
  }

  throw lastError;
}

function runtimeDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (
      url.hostname.endsWith(".neon.tech") &&
      !url.hostname.includes("-pooler.")
    ) {
      url.hostname = url.hostname.replace(/^(ep-[^.]+)\./, "$1-pooler.");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function createPrismaClient() {
  const databaseUrl = runtimeDatabaseUrl();
  return new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000,
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        // 性能排查用：PRISMA_QUERY_TRACE=1 启动服务，每条 SQL 会打进服务端日志。
        // 默认关闭，用来数"一次请求到底发了几条查询"（详见 AGENTS.md）。
        if (process.env.PRISMA_QUERY_TRACE === "1") {
          console.log("[qc] " + Date.now() + " " + operation);
        }
        const maxAttempts = isReadOperation(operation) ? 5 : 3;
        return retryConnection(() => query(args), maxAttempts);
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

export type PrismaTransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * 交互事务的整段重试。
 *
 * Neon 冷启动或连接抖动时，事务里的某次查询可能已经让事务过期。
 * 这时继续重试单条查询没有意义，必须从整个事务重新开始。
 * 传入的事务要么全部提交，要么全部回滚，所以整段重试是安全的。
 */
export async function withTransactionRetry<T>(
  callback: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectionError(error) || attempt === 3) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** (attempt - 1)),
      );
    }
  }

  throw lastError;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
