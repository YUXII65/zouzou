import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { createReviewDraft } from "@/lib/review-ai";

export const dynamic = "force-dynamic";

function parseDateInput(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { reviewDate?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const reviewDate = parseDateInput(body.reviewDate);
  if (!reviewDate) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  try {
    const result = await createReviewDraft({ userId: user.id, reviewDate });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}