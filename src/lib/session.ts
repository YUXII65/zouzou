import { createHmac } from "node:crypto";

export const SESSION_COOKIE = "next_step_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const DEV_SECRET = "next-step-dev-secret-change-me";

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (value && value !== "change-to-a-long-random-string") return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET 必须在生产环境配置为足够长的随机字符串");
  }
  return DEV_SECRET;
}

export function issueSessionToken(userId: string) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function readSessionToken(token: string) {
  const [userId, expiresAt, signature] = token.split(".");
  if (!userId || !expiresAt || !signature) return null;
  if (Number(expiresAt) < Date.now()) return null;

  const expected = createHmac("sha256", secret())
    .update(`${userId}.${expiresAt}`)
    .digest("base64url");
  if (signature !== expected) return null;

  return userId;
}
