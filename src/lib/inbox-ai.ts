import { revalidatePath } from "next/cache";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { prisma } from "@/lib/prisma";
import {
  clarifyInbox,
  generateSocraticClarification,
  planInbox,
  type InboxClarification,
  type InboxClarificationHistoryItem,
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

function parseSocraticState(value: string | null): InboxClarification | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (raw.mode !== "socratic" || !Array.isArray(raw.history)) return null;
    return raw as InboxClarification;
  } catch {
    return null;
  }
}

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

  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: input.userId,
  });

  const clarification = await withAiQuota("inbox_clarify", () =>
    clarifyInbox(
      content,
      aiContext.projectFacts.map((project) => project.name),
      input.overrides?.apiKey,
      input.overrides?.model,
      input.overrides?.baseUrl,
      aiContext.projectFacts,
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

export async function createSocraticInboxClarification(input: {
  userId: string;
  content: string;
  overrides?: AiOverrides;
  onDelta?: (delta: string) => void;
}): Promise<ClarifyInboxResult> {
  const content = input.content.trim();
  const item = await prisma.inboxItem.create({
    data: { userId: input.userId, content, source: "manual" },
  });
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: input.userId,
  });
  const clarification = await withAiQuota("inbox_clarify", () =>
    generateSocraticClarification({
      content,
      history: [],
      apiKey: input.overrides?.apiKey,
      model: input.overrides?.model,
      baseUrl: input.overrides?.baseUrl,
      projectContext: aiContext.projectFacts,
      memorySummary: aiContext.summary,
      evidence: aiContext.evidence,
      decisionMemory: aiContext.decisionMemory,
      maxQuestions: 3,
      onDelta: input.onDelta,
    }),
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

export async function advanceSocraticInboxClarification(input: {
  userId: string;
  itemId: string;
  answer: string[];
  overrides?: AiOverrides;
  onDelta?: (delta: string) => void;
}): Promise<ClarifyInboxResult | null> {
  const item = await prisma.inboxItem.findUnique({
    where: { id: input.itemId, userId: input.userId },
    select: { id: true, content: true, status: true, aiSuggestionJson: true },
  });
  if (!item || item.status !== "inbox") return null;
  const current = parseSocraticState(item.aiSuggestionJson);
  if (!current || current.status !== "asking" || !current.history?.length) return null;
  const unansweredIndex = current.history.findIndex((entry) => entry.answer.length === 0);
  if (unansweredIndex < 0) return null;
  const answer = input.answer
    .map((entry) => String(entry).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 6);
  if (!answer.length) return null;
  const history: InboxClarificationHistoryItem[] = current.history.map(
    (entry, index) => index === unansweredIndex ? { ...entry, answer } : entry,
  );
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: input.userId,
  });
  const clarification = await withAiQuota("inbox_clarify", () =>
    generateSocraticClarification({
      content: item.content,
      history,
      apiKey: input.overrides?.apiKey,
      model: input.overrides?.model,
      baseUrl: input.overrides?.baseUrl,
      projectContext: aiContext.projectFacts,
      memorySummary: aiContext.summary,
      evidence: aiContext.evidence,
      decisionMemory: aiContext.decisionMemory,
      maxQuestions: current.maxQuestions ?? 3,
      frame: current.frame ?? null,
      onDelta: input.onDelta,
    }),
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
  return { itemId: item.id, content: item.content, clarification };
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
    select: { id: true, content: true, status: true, aiSuggestionJson: true },
  });

  if (!item || item.status !== "inbox") return null;

  const clarificationState = parseSocraticState(item.aiSuggestionJson);
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: input.userId,
  });
  const plan = await withAiQuota("inbox_plan", () =>
    planInbox(
      item.content,
      aiContext.projectFacts.map((project) => project.name),
      input.overrides?.apiKey,
      input.overrides?.model,
      input.overrides?.baseUrl,
      input.option,
      input.supplement,
      aiContext.projectFacts,
      aiContext.summary,
      input.dimensionChoices,
      aiContext.evidence,
      aiContext.maxPlanTasks,
      input.onDelta,
      clarificationState?.history,
      clarificationState?.summary,
      clarificationState?.frame,
      clarificationState?.session,
      aiContext.decisionMemory,
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
