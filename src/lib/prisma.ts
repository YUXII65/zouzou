import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1017", "P2024", "P2034"]);
const RETRYABLE_MESSAGE_PATTERN =
  /terminating connection due to administrator command|can't reach database server|please make sure the database server is running|connection.*(?:closed|reset)|ECONNRESET|server closed the connection/i;

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
        setTimeout(resolve, 120 * 2 ** (attempt - 1)),
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
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        const maxAttempts = isReadOperation(operation) ? 3 : 2;
        return retryConnection(() => query(args), maxAttempts);
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
