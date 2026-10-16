import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { buildTodayView, withLegacyTodayFields } from "@/lib/today-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 与网页首页共用同一份今日视图契约（src/lib/today-view.ts）；
  // withLegacyTodayFields 是过渡期兼容，供线上旧小程序包使用。
  const view = await buildTodayView({ userId: user.id });
  return NextResponse.json({
    ...withLegacyTodayFields(view),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  });
}