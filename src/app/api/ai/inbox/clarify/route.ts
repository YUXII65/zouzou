import { getCurrentUser } from "@/lib/auth";
import { isAiQuotaEnabled } from "@/lib/ai-quota";
import { buildAiStreamPreview } from "@/lib/ai-stream-preview";
import { createInboxClarification } from "@/lib/inbox-ai";
import { createNdjsonResponse } from "@/lib/ndjson-response";

export const dynamic = "force-dynamic";

type ClarifyRequest = {
  content?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  let body: ClarifyRequest;
  try {
    body = (await request.json()) as ClarifyRequest;
  } catch {
    return Response.json({ error: "请求内容不正确" }, { status: 400 });
  }

  const content = body.content?.trim().slice(0, 4000);
  if (!content) {
    return Response.json({ error: "先写下一个想法" }, { status: 400 });
  }

  const overrides = isAiQuotaEnabled()
    ? undefined
    : {
        apiKey: body.apiKey?.trim() || undefined,
        model: body.model?.trim() || undefined,
        baseUrl: body.baseUrl?.trim() || undefined,
      };

  return createNdjsonResponse(async (send) => {
    send({ type: "preview", text: "正在读你的原话..." });
    let raw = "";
    let lastPreview = "";
    const result = await createInboxClarification({
      userId: user.id,
      content,
      overrides,
      onDelta: (delta) => {
        raw += delta;
        const preview = buildAiStreamPreview(raw, "clarify");
        if (preview && preview !== lastPreview) {
          lastPreview = preview;
          send({ type: "preview", text: preview });
        }
      },
    });
    send({ type: "done", result });
  });
}
