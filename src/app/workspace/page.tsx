import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** v3.3：书桌并进文件页，旧链接继续可用。 */
export default async function WorkspaceRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  const suffix = query.toString();
  redirect(suffix ? "/files?" + suffix : "/files");
}
