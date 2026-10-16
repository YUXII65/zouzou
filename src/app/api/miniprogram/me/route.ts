import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { buildProfileView } from "@/lib/profile-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 与网页 /profile 共用同一份视图契约（src/lib/profile-view.ts）。
  const view = await buildProfileView({ userId: user.id });
  if (!view) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    user: view.user,
    counts: view.counts,
    serverConnected: view.serverConnected,
  });
}
