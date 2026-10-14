import { readSessionUserId } from "@/lib/auth";
import { shouldUseClientAiOverrides } from "@/lib/ai-quota";
import { buildAiStreamPreview } from "@/lib/ai-stream-preview";
import {
  advanceSocraticInboxClarification,
  createSocraticInboxClarification,
} from "@/lib/inbox-ai";
import { createNdjsonResponse } from "@/lib/ndjson-response";

export const dynamic = "force-dynamic";

type ClarifyRequest = {
  content?: string;
  mode?: "socratic";
  itemId?: string;
  answer?: string[];
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export async function POST(request: Request) {
  const userId = await readSessionUserId();
  if (!userId) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  let body: ClarifyRequest;
  try {
    body = (await request.json()) as ClarifyRequest;
  } catch {
    return Response.json({ error: "请求内容不正确" }, { status: 400 });
  }

  const overrides = shouldUseClientAiOverrides()
    ? {
        apiKey: body.apiKey?.trim() || undefined,
        model: body.model?.trim() || undefined,
        baseUrl: body.baseUrl?.trim() || undefined,
      }
    : undefined;
  if (body.mode === "socratic" && body.itemId) {
    const itemId = body.itemId.trim();
    const answer = Array.isArray(body.answer)
      ? body.answer.map((entry) => String(entry)).filter(Boolean).slice(0, 6)
      : [];
    if (!itemId || !answer.length) {
      return Response.json({ error: "缺少这一轮的回答" }, { status: 400 });
    }

    return createNdjsonResponse(async (send) => {
      send({ type: "preview", text: "正在顺着你的回答往下判断..." });
      let raw = "";
      let lastPreview = "";
      const result = await advanceSocraticInboxClarification({
        userId: userId,
        itemId,
        answer,
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
      if (!result) {
        send({ type: "error", message: "这一轮已经处理过了" });
        return;
      }
      send({ type: "done", result });
    });
  }

  const content = body.content?.trim().slice(0, 4000);
  if (!content) {
    return Response.json({ error: "先写下一个想法" }, { status: 400 });
  }

  return createNdjsonResponse(async (send) => {
    send({ type: "preview", text: "正在读你的原话..." });
    let raw = "";
    let lastPreview = "";
    const onDelta = (delta: string) => {
      raw += delta;
      const preview = buildAiStreamPreview(raw, "clarify");
      if (preview && preview !== lastPreview) {
        lastPreview = preview;
        send({ type: "preview", text: preview });
      }
    };
    const result = await createSocraticInboxClarification({
      userId: userId,
      content,
      overrides,
      onDelta,
    });
    send({ type: "done", result });
  });
}
