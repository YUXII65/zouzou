import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { generateTodayFocus } from "@/lib/today-focus-generate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 与网页首页的「今天要做」推荐共用同一份实现（src/lib/today-focus-generate.ts）。
  const suggestions = await generateTodayFocus(user.id);
  revalidatePath("/");
  return NextResponse.json({ suggestions });
}