import { NextResponse } from "next/server";
import { isAiQuotaEnabled } from "@/lib/ai-quota";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { createInboxPlan } from "@/lib/inbox-ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    itemId?: string;
    option?: string;
    supplement?: string;
    dimensionChoices?: string[];
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
  }

  const overrides = isAiQuotaEnabled()
    ? undefined
    : {
        apiKey: body.apiKey?.trim() || undefined,
        model: body.model?.trim() || undefined,
        baseUrl: body.baseUrl?.trim() || undefined,
      };
  const dimensionChoices = Array.isArray(body.dimensionChoices)
    ? body.dimensionChoices.map((choice) => String(choice).trim()).filter(Boolean).slice(0, 8)
    : [];

  try {
    const plan = await createInboxPlan({
      userId: user.id,
      itemId,
      option: body.option?.trim() || undefined,
      supplement: body.supplement?.trim() || undefined,
      dimensionChoices,
      overrides,
    });
    if (!plan) {
      return NextResponse.json({ error: "already_processed" }, { status: 409 });
    }
    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}