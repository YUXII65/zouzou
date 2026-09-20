import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { getFirstRunState, setFirstRunTourStep } from "@/lib/first-run";

export const dynamic = "force-dynamic";

const steps = ["1", "2", "3", "done"] as const;

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = await getFirstRunState(user.id, user.createdAt);
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { step?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const step = body.step;
  if (!step || !steps.includes(step as (typeof steps)[number])) {
    return NextResponse.json({ error: "invalid_step" }, { status: 400 });
  }

  await setFirstRunTourStep(user.id, step);
  const state = await getFirstRunState(user.id, user.createdAt);
  return NextResponse.json(state);
}