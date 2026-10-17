import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildAiContext } from "@/lib/ai-context";
import {
  createAgentFailedPlan,
  isNormalAgentPlanEnabled,
  planNormalWithAgents,
} from "@/lib/agent-plan/normal";
import { withAiQuota } from "@/lib/ai-quota";
import { prisma } from "@/lib/prisma";
import { scrubRecordToolMentions } from "@/lib/ai-quality";
import {
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

export async function createSocraticInboxClarification(input: {
  userId: string;
  content: string;
  overrides?: AiOverrides;
  onDelta?: (delta: string) => void;
}): Promise<ClarifyInboxResult> {
  const content = input.content.trim();
  // 这里不再"先建记录拿 id 再更新"（=两次跨洋写入，约 900ms）。
  // 改成：自己生成 id → 先调模型 → 一次 create 写入全部字段；模型失败也要把用户写的内容留下来。
  const itemId = randomUUID();
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: itemId,
    userId: input.userId,
  });
  let clarification: InboxClarification;
  try {
    clarification = await withAiQuota("inbox_clarify", () =>
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
        maxQuestions: 4,
        minQuestions: 2,
        onDelta: input.onDelta,
      }),
      input.userId,
    );
  } catch (error) {
    await prisma.inboxItem.create({
      data: { id: itemId, userId: input.userId, content, source: "manual" },
    });
    throw error;
  }
  await prisma.inboxItem.create({
    data: {
      id: itemId,
      userId: input.userId,
      content,
      source: "manual",
      aiSuggestionJson: JSON.stringify(clarification),
      aiAnalyzedAt: new Date(),
    },
  });
  revalidatePath("/");
  revalidatePath("/files");

  return { itemId, content, clarification };

}

export async function advanceSocraticInboxClarification(input: {
  userId: string;
  itemId: string;
  answer: string[];
  questionKey?: string;
  overrides?: AiOverrides;
  onDelta?: (delta: string) => void;
}): Promise<ClarifyInboxResult | null> {
  const item = await prisma.inboxItem.findUnique({
    where: { id: input.itemId, userId: input.userId },
    select: { id: true, content: true, status: true, aiSuggestionJson: true },
  });
  if (!item || item.status !== "inbox") return null;
  const current = parseSocraticState(item.aiSuggestionJson);
  if (!current) return null;
  const idempotentResult = {
    itemId: item.id,
    content: item.content,
    clarification: current,
  };
  // 幂等：同一轮已经处理过或已经收口时，直接返回当前状态。
  // 前端可能已经提交成功但响应丢失，重试必须能恢复，不能报错卡死。
  if (current.status !== "asking" || !current.history?.length) {
    return idempotentResult;
  }
  const unansweredIndex = current.history.findIndex(
    (entry) => entry.answer.length === 0,
  );
  if (unansweredIndex < 0) {
    return idempotentResult;
  }
  const expectedQuestionKey = input.questionKey?.trim();
  if (
    expectedQuestionKey &&
    current.history[unansweredIndex].key !== expectedQuestionKey
  ) {
    // 客户端重试的是上一轮已经回答的问题；当前已经推进到新问题，
    // 直接把当前状态还给它，不能把旧答案填进新问题。
    return idempotentResult;
  }
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
      maxQuestions: current.maxQuestions ?? 4,
      minQuestions: 2,
      frame: current.frame ?? null,
      translation: current.translation ?? null,
      onDelta: input.onDelta,
    }),
    input.userId,
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
  /** 自动整理流程不需要让首页立刻重新请求，避免把本地完成态刷掉。 */
  skipRevalidate?: boolean;
}): Promise<InboxPlan | null> {
  const item = await prisma.inboxItem.findUnique({
    where: { id: input.itemId, userId: input.userId },
    select: {
      id: true,
      content: true,
      status: true,
      aiSuggestionJson: true,
      aiPlanJson: true,
      mode: true,
    },
  });

  if (!item || item.status !== "inbox") return null;

  // 已有计划（例如澄清结束时已经后台预生成）就直接返回，不要再调一次模型。
  // 但是降级/失败结果必须允许重试，不能把一次坏结果永久缓存。
  if (item.aiPlanJson) {
    try {
      const existing = JSON.parse(item.aiPlanJson) as InboxPlan;
      if (
        existing.source !== "heuristic_fallback" &&
        existing.source !== "agent_failed"
      ) {
        return existing;
      }
    } catch {
      // 解析失败就照常重新生成
    }
  }

  const clarificationState = parseSocraticState(item.aiSuggestionJson);
  const planStartedAt = Date.now();
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: input.userId,
  });
  const plan = await withAiQuota("inbox_plan", async () => {
    if (isNormalAgentPlanEnabled()) {
      const normalResult = await planNormalWithAgents({
        content: item.content,
        history: clarificationState?.history,
        summary: clarificationState?.summary,
        frame: clarificationState?.frame,
        translation: clarificationState?.translation,
        workMode: clarificationState?.workMode ?? null,
        modeJudgment: clarificationState?.modeJudgment ?? null,
        projectContext: aiContext.projectFacts,
        memorySummary: aiContext.summary,
        evidence: aiContext.evidence,
        decisionMemory: aiContext.decisionMemory,
        maxTasks: aiContext.maxPlanTasks,
        apiKey: input.overrides?.apiKey,
        model: input.overrides?.model,
        baseUrl: input.overrides?.baseUrl,
        onDelta: input.onDelta,
      });

      if (normalResult.status === "ok") return normalResult.plan;
      if (normalResult.status === "failed") {
        // 时间预算已经耗尽时不能继续叠旧链，否则小程序请求会被客户端先切断，
        // 用户只看到澄清停在一半。明确返回可重试的失败结果，不生成散落任务。
        if (Date.now() - planStartedAt >= 18_000) {
          return createAgentFailedPlan({
            reason: normalResult.reason || "规划时间预算用尽",
            issues: normalResult.issues,
          });
        }
        // 新版方案链快速失败时才回退旧链；保留一次质量兜底。
        console.warn(
          "[inbox] chain failed, falling back to planInbox:",
          normalResult.reason,
          normalResult.issues,
        );
      }
      // not_normal / failed / disabled 都继续走原来的计划链路。
    }

    return planInbox(
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
      clarificationState?.workMode ?? item.mode ?? undefined,
    );
  }, input.userId);

  const scrubbedPlan = scrubRecordToolMentions(plan);
  await prisma.inboxItem.update({
    where: { id: input.itemId, userId: input.userId },
    data: {
      aiPlanJson: JSON.stringify(scrubbedPlan),
      aiAnalyzedAt: new Date(),
    },
  });

  if (!input.skipRevalidate) {
    revalidatePath("/");
    revalidatePath("/workspace");
  }
  return scrubbedPlan;
}
