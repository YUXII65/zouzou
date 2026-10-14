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
  readList,
  readPlan,
  readText,
  type NormalAgentPlan,
} from "@/lib/agent-plan/core";
import {
  CONTENT_GENERATION_SYSTEM_PROMPT,
  DIRECT_ANSWER_SYSTEM_PROMPT,
} from "@/lib/agent-plan/prompts";

export type DirectAnswerResult = {
  answer: string;
  keyPoints: string[];
  nextAction: string | null;
  reason: string;
};

export type ContentAgentResult = {
  /** 第二段排出的那条规划；模型没给出可用结构时为 null。 */
  plan: NormalAgentPlan | null;
  /** answer 模式下的直接回答；其他模式为 null。 */
  directAnswer?: DirectAnswerResult | null;
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
  decisionMemory?: string[];
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): Promise<ContentAgentResult> {
  if (
    process.env.ANSWER_MODE_ENABLED === "true" &&
    input.translation.responseMode === "answer"
  ) {
    const answerText = await callModel(
      DIRECT_ANSWER_SYSTEM_PROMPT,
      JSON.stringify({
        originalIdea: input.content,
        translation: input.translation,
        clarificationHistory: (input.history ?? []).map((item) => ({
          question: item.question,
          answers: item.answer,
          reflection: item.reflection ?? null,
        })),
        clarificationSummary: input.summary ?? null,
        contextEvidence: input.evidence ?? [],
        decisionMemory: input.decisionMemory ?? [],
        currentDate: toDateInputValue(new Date()),
      }),
      input.apiKey,
      input.model,
      input.baseUrl,
      0.35,
      {
        maxTokens: 1800,
        timeoutMs: 15_000,
        totalBudgetMs: 15_000,
        maxAttempts: 1,
        reasoningEffort: "none",
        qualityRules: "",
      },
    );
    const answerValue = parseObject(answerText);
    const answer = readText(answerValue.answer, 2400);
    if (answer) {
      return {
        plan: null,
        directAnswer: {
          answer,
          keyPoints: readList(answerValue.keyPoints, 6, 240),
          nextAction: readText(answerValue.nextAction, 300) || null,
          reason: readText(answerValue.reason, 300),
        },
        usedTranslation: true,
      };
    }
  }

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
      decisionMemory: input.decisionMemory ?? [],
      currentDate: toDateInputValue(new Date()),
    }),
    input.apiKey,
    input.model,
    input.baseUrl,
    0.55,
    {
      maxTokens: 2200,
      timeoutMs: 20_000,
      totalBudgetMs: 20_000,
      maxAttempts: 1,
      reasoningEffort: "none",
      qualityRules: "",
    },
  );
  const plan = readPlan(parseObject(text));
  return { plan, usedTranslation: true };
}
