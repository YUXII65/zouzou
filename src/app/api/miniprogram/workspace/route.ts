import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { buildFilesView } from "@/lib/files-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 与网页 /files 共用同一份文件页视图契约（src/lib/files-view.ts）。
  const view = await buildFilesView({ userId: user.id });
  return NextResponse.json(view);
}