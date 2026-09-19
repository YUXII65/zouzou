import { NextResponse } from "next/server";
import { isAiQuotaEnabled } from "@/lib/ai-quota";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { createInboxClarification } from "@/lib/inbox-ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { content?: string; apiKey?: string; model?: string; baseUrl?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const content = body.content?.trim().slice(0, 4000);
  if (!content) {
    return NextResponse.json({ error: "empty_content" }, { status: 400 });
  }

  const overrides = isAiQuotaEnabled()
    ? undefined
    : {
        apiKey: body.apiKey?.trim() || undefined,
        model: body.model?.trim() || undefined,
        baseUrl: body.baseUrl?.trim() || undefined,
      };

  try {
    const result = await createInboxClarification({
      userId: user.id,
      content,
      overrides,
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}