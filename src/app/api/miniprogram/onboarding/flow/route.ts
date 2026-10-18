import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import {
  clarifyOnboardingForUser,
  completeFirstRunForUser,
  planOnboardingForUser,
  skipOnboardingForUser,
  type FirstRunCompleteInput,
} from "@/lib/onboarding-flow";

export const dynamic = "force-dynamic";

type Body =
  | { action: "clarify"; idea: string }
  | { action: "plan"; idea: string }
  | ({ action: "complete" } & FirstRunCompleteInput)
  | { action: "skip" };

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (body.action === "clarify") {
      const clarification = await clarifyOnboardingForUser(user.id, body.idea);
      return NextResponse.json({ clarification });
    }

    if (body.action === "plan") {
      const plan = await planOnboardingForUser(user.id, body.idea);
      return NextResponse.json({ plan });
    }

    if (body.action === "complete") {
      const result = await completeFirstRunForUser(user.id, body);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (body.action === "skip") {
      await skipOnboardingForUser(user.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    console.error("[miniprogram:onboarding-flow]", error);
    return NextResponse.json({ error: "onboarding_failed" }, { status: 503 });
  }
}
