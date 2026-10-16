import { getCurrentUser } from "@/lib/auth";

const DEFAULT_ADMIN_USERNAMES = ["yuxii"];

function normalizeAdminUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isAdminUsername(username: string) {
  const configuredAdmin = process.env.ADMIN_USERNAME?.trim();
  const adminUsernames = [
    ...DEFAULT_ADMIN_USERNAMES,
    ...(configuredAdmin ? configuredAdmin.split(",") : []),
  ]
    .map(normalizeAdminUsername)
    .filter(Boolean);
  return adminUsernames.includes(normalizeAdminUsername(username));
}

export async function getAdminUser() {
  const user = await getCurrentUser();
  if (!user) return null;

  return isAdminUsername(user.username) ? user : null;
}