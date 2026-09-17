import { getCurrentUser } from "@/lib/auth";
import { isAiQuotaEnabled } from "@/lib/ai-quota";
import { buildAiStreamPreview } from "@/lib/ai-stream-preview";
import { createInboxPlan } from "@/lib/inbox-ai";
import { createNdjsonResponse } from "@/lib/ndjson-response";

export const dynamic = "force-dynamic";

type PlanRequest = {
  itemId?: string;
  option?: string;
  supplement?: string;
  dimensionChoices?: string[];
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  let body: PlanRequest;
  try {
    body = (await request.json()) as PlanRequest;
  } catch {
    return Response.json({ error: "请求内容不正确" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return Response.json({ error: "没有找到要整理的想法" }, { status: 400 });
  }

  const overrides = isAiQuotaEnabled()
    ? undefined
    : {
        apiKey: body.apiKey?.trim() || undefined,
        model: body.model?.trim() || undefined,
        baseUrl: body.baseUrl?.trim() || undefined,
      };
  const dimensionChoices = Array.isArray(body.dimensionChoices)
    ? body.dimensionChoices
        .map((choice) => String(choice).trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return createNdjsonResponse(async (send) => {
    send({ type: "preview", text: "正在把你的选择收成具体任务..." });
    let raw = "";
    let lastPreview = "";
    const plan = await createInboxPlan({
      userId: user.id,
      itemId,
      option: body.option?.trim() || undefined,
      supplement: body.supplement?.trim() || undefined,
      dimensionChoices,
      overrides,
      onDelta: (delta) => {
        raw += delta;
        const preview = buildAiStreamPreview(raw, "plan");
        if (preview && preview !== lastPreview) {
          lastPreview = preview;
          send({ type: "preview", text: preview });
        }
      },
    });

    if (!plan) {
      send({ type: "error", message: "这条想法已经处理过了" });
      return;
    }
    send({ type: "done", result: plan });
  });
}
