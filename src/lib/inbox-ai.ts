import { revalidatePath } from "next/cache";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { prisma } from "@/lib/prisma";
import {
  clarifyInbox,
  planInbox,
  type InboxClarification,
  type InboxPlan,
} from "@/lib/ai";

type AiOverrides = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type ClarifyInboxResult = {
  itemId: string;
  content: string;
  clarification: InboxClarification;
};

export async function createInboxClarification(input: {
  userId: string;
  content: string;
  overrides?: AiOverrides;
  onDelta?: (delta: string) => void;
}): Promise<ClarifyInboxResult> {
  const content = input.content.trim();
  const item = await prisma.inboxItem.create({
    data: {
      userId: input.userId,
      content,
      source: "manual",
    },
  });

  const projects = await prisma.project.findMany({
    where: { userId: input.userId },
    select: {
      name: true,
      objective: true,
      currentMilestone: true,
    },
    orderBy: { name: "asc" },
  });
  const projectContext = projects.map((project) => ({
    name: project.name,
    objective: project.objective,
    currentMilestone: project.currentMilestone,
  }));
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: input.userId,
  });

  const clarification = await withAiQuota("inbox_clarify", () =>
    clarifyInbox(
      content,
      projects.map((project) => project.name),
      input.overrides?.apiKey,
      input.overrides?.model,
      input.overrides?.baseUrl,
      projectContext,
      aiContext.summary,
      aiContext.evidence,
      input.onDelta,
    ),
  );

  await prisma.inboxItem.update({
    where: { id: item.id, userId: input.userId },
    data: {
      aiSuggestionJson: JSON.stringify(clarification),
      aiAnalyzedAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
  return { itemId: item.id, content, clarification };
}

export async function createInboxPlan(input: {
  userId: string;
  itemId: string;
  option?: string;
  supplement?: string;
  dimensionChoices?: string[];
  overrides?: AiOverrides;
  onDelta?: (delta: string) => void;
}): Promise<InboxPlan | null> {
  const item = await prisma.inboxItem.findUnique({
    where: { id: input.itemId, userId: input.userId },
    select: { id: true, content: true, status: true },
  });

  if (!item || item.status !== "inbox") return null;

  const projects = await prisma.project.findMany({
    where: { userId: input.userId },
    select: {
      name: true,
      objective: true,
      currentMilestone: true,
    },
    orderBy: { name: "asc" },
  });
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: input.userId,
  });
  const plan = await withAiQuota("inbox_plan", () =>
    planInbox(
      item.content,
      projects.map((project) => project.name),
      input.overrides?.apiKey,
      input.overrides?.model,
      input.overrides?.baseUrl,
      input.option,
      input.supplement,
      projects.map((project) => ({
        name: project.name,
        objective: project.objective,
        currentMilestone: project.currentMilestone,
      })),
      aiContext.summary,
      input.dimensionChoices,
      aiContext.evidence,
      aiContext.maxPlanTasks,
      input.onDelta,
    ),
  );

  await prisma.inboxItem.update({
    where: { id: input.itemId, userId: input.userId },
    data: {
      aiPlanJson: JSON.stringify(plan),
      aiAnalyzedAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
  return plan;
}
