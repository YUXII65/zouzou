import { confirmInboxPlan } from "@/app/actions";
import { readSessionUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await readSessionUserId();
  if (!userId) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  let body: { itemId?: string };
  try {
    body = (await request.json()) as { itemId?: string };
  } catch {
    return Response.json({ error: "请求内容不正确" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return Response.json({ error: "没有找到要整理的记录" }, { status: 400 });
  }

  const formData = new FormData();
  formData.set("id", itemId);
  const result = await confirmInboxPlan(formData);
  if (!result) {
    return Response.json({ error: "这条记录已经处理过了" }, { status: 409 });
  }

  return Response.json({ result });
}
