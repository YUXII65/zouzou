import {
  callModel,
  type InboxClarificationFrame,
  type InboxClarificationHistoryItem,
  type InboxClarificationSummary,
  type InboxClarificationTranslation,
  type InboxProjectContext,
} from "@/lib/ai";
import { toDateInputValue } from "@/lib/date";
import {
  parseObject,
  readPlan,
  type NormalAgentPlan,
} from "@/lib/agent-plan/core";
import { CONTENT_GENERATION_SYSTEM_PROMPT } from "@/lib/agent-plan/prompts";

export type ContentAgentResult = {
  /** 第二段排出的那条规划；模型没给出可用结构时为 null。 */
  plan: NormalAgentPlan | null;
  usedTranslation: boolean;
};

export async function runContentAgent(input: {
  content: string;
  translation: InboxClarificationTranslation;
  history?: InboxClarificationHistoryItem[];
  summary?: InboxClarificationSummary | null;
  frame?: InboxClarificationFrame | null;
  projectContext?: InboxProjectContext[];
  memorySummary?: string | null;
  evidence?: string[];
  webEvidence?: unknown;
  decisionMemory?: string[];
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<ContentAgentResult> {
  const timeoutMs = Math.max(2_000, Math.min(input.timeoutMs ?? 20_000, 20_000));
  const text = await callModel(
    CONTENT_GENERATION_SYSTEM_PROMPT,
    JSON.stringify({
      originalIdea: input.content,
      translation:
        input.translation.responseMode === "plan"
          ? input.translation
          : { ...input.translation, responseMode: "action" },
      clarificationHistory: (input.history ?? []).map((item) => ({
        question: item.question,
        answers: item.answer,
        reflection: item.reflection ?? null,
      })),
      clarificationSummary: input.summary ?? null,
      clarificationFrame: input.frame ?? null,
      projectContext: input.projectContext ?? [],
      memorySummary: input.memorySummary ?? null,
      contextEvidence: input.evidence ?? [],
      webEvidence: input.webEvidence ?? null,
      decisionMemory: input.decisionMemory ?? [],
      currentDate: toDateInputValue(new Date()),
    }),
    input.apiKey,
    input.model,
    input.baseUrl,
    0.55,
    {
      maxTokens: 2200,
      timeoutMs,
      totalBudgetMs: timeoutMs,
      maxAttempts: 1,
      reasoningEffort: "none",
      qualityRules: "",
    },
  );
  const plan = readPlan(parseObject(text));
  return { plan, usedTranslation: true };
}
