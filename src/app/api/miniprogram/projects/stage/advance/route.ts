import { NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { advanceProjectStage } from "@/lib/project-stage-advance";
import { generateLongtermStagePreview } from "@/lib/project-progress-agent";
import { invalidateAiContext } from "@/lib/ai-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { stageId?: string };
  try {
    body = (await request.json()) as { stageId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const stageId = body.stageId?.trim();
  if (!stageId) {
    return NextResponse.json({ error: "missing_stage_id" }, { status: 400 });
  }

  // 与网页文件页的「进入下一阶段」共用同一份实现（src/lib/project-stage-advance.ts）。
  const result = await advanceProjectStage({ userId: user.id, stageId });
  if (result.nextStageId) {
    const nextStageId = result.nextStageId;
    after(() =>
      generateLongtermStagePreview({
        userId: user.id,
        stageId: nextStageId,
      }).catch(() => {}),
    );
  }
  if (result.advanced) {
    invalidateAiContext(user.id);
    revalidatePath("/");
    revalidatePath("/files");
  }
  return NextResponse.json(result);
}