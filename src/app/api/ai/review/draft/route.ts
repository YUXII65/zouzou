import { getCurrentUser } from "@/lib/auth";
import { buildAiStreamPreview } from "@/lib/ai-stream-preview";
import { createNdjsonResponse } from "@/lib/ndjson-response";
import { createReviewDraft } from "@/lib/review-ai";

export const dynamic = "force-dynamic";

function parseDateInput(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  let body: { reviewDate?: string };
  try {
    body = (await request.json()) as { reviewDate?: string };
  } catch {
    return Response.json({ error: "请求内容不正确" }, { status: 400 });
  }

  const reviewDate = parseDateInput(body.reviewDate);
  if (!reviewDate) {
    return Response.json({ error: "请选择正确的复盘日期" }, { status: 400 });
  }

  return createNdjsonResponse(async (send) => {
    send({ type: "preview", text: "正在回看这一天的任务..." });
    let raw = "";
    let lastPreview = "";
    const result = await createReviewDraft({
      userId: user.id,
      reviewDate,
      onDelta: (delta) => {
        raw += delta;
        const preview = buildAiStreamPreview(raw, "review");
        if (preview && preview !== lastPreview) {
          lastPreview = preview;
          send({ type: "preview", text: preview });
        }
      },
    });
    send({ type: "done", result });
  });
}
