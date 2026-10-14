import { getCurrentUser } from "@/lib/auth";

export function isAdminUsername(username: string) {
  const configuredAdmin = process.env.ADMIN_USERNAME?.trim();
  if (!configuredAdmin) return false;
  return username.toLowerCase() === configuredAdmin.toLowerCase();
}

export async function getAdminUser() {
  const user = await getCurrentUser();
  if (!user) return null;

  return isAdminUsername(user.username) ? user : null;
}