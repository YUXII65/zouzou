import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user });
}