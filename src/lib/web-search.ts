import type {
  InboxClarificationHistoryItem,
  InboxClarificationTranslation,
  InboxPlan,
  InboxPlanSourceLink,
} from "@/lib/ai";
import { routeTool, type ToolKind } from "@/lib/tool-router";

type FetchLike = typeof fetch;

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  summary: string;
  siteName: string | null;
  publishedAt: string | null;
  authority: number;
  rerankScore: number;
};

export type PlanWebEvidence = {
  status: "ok" | "empty" | "failed" | "skipped";
  kind: ToolKind;
  query: string;
  results: WebSearchResult[];
  fetchedUrl?: string;
  error?: string;
  fetchedAt: string;
};

export type WebEvidenceInput = {
  content: string;
  history?: InboxClarificationHistoryItem[];
  translation?: InboxClarificationTranslation | null;
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

const DEFAULT_TIMEOUT_MS = 7_000;
const DEFAULT_COUNT = 4;
const MAX_QUERY_LENGTH = 128;
const MAX_RESULTS = 5;

function unicodeSlice(value: string, max: number) {
  return Array.from(value).slice(0, max).join("");
}

function compact(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEndpoint(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1")
    ? `${base}/${path.replace(/^\/+/, "")}`
    : `${base}/v1/${path.replace(/^\/+/, "")}`;
}

function resolveBaseUrl(baseUrl?: string) {
  return (
    baseUrl ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com"
  ).trim();
}

function resolveApiKey(apiKey?: string) {
  return (
    apiKey ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  ).trim();
}

function extractFirstUrl(content: string) {
  const match = content.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match?.[0]?.replace(/[.,;:!?，。；：！？]+$/, "") ?? null;
}

function readString(value: unknown, max = 1_200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSearchResult(raw: unknown): WebSearchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const url = readString(value.url, 2_000);
  if (!url) return null;
  return {
    title: readString(value.title, 300) || url,
    url,
    snippet: readString(value.snippet, 500),
    summary: readString(value.summary, 1_600),
    siteName: readString(value.site_name, 160) || null,
    publishedAt: readString(value.date, 80) || null,
    authority: Math.max(-1, Math.min(4, readNumber(value.authority, -1))),
    rerankScore: readNumber(value.rerank_score, 0),
  };
}

function buildToolSignal(input: WebEvidenceInput) {
  const historyAnswers = (input.history ?? []).flatMap((item) =>
    (item.answer ?? []).map((answer) => compact(answer)),
  );
  return [
    input.content,
    ...historyAnswers,
    input.translation?.desiredOutcome,
    input.translation?.normalizedIntent,
    ...(input.translation?.goals ?? []),
    ...(input.translation?.confirmedFacts ?? []),
    ...(input.translation?.constraints ?? []),
  ]
    .map((part) => compact(part))
    .filter(Boolean)
    .join(" ");
}

export function buildWebSearchQuery(input: {
  content: string;
  history?: InboxClarificationHistoryItem[];
  translation?: InboxClarificationTranslation | null;
}) {
  const translation = input.translation;
  const historyAnswers = (input.history ?? []).flatMap((item) =>
    (item.answer ?? []).map((answer) => compact(answer)),
  );
  const parts = [
    translation?.desiredOutcome,
    translation?.normalizedIntent,
    input.content,
    ...historyAnswers,
    ...(translation?.goals ?? []),
    ...(translation?.confirmedFacts ?? []),
    ...(translation?.constraints ?? []),
  ]
    .map((part) => compact(part))
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unicodeSlice(unique.join(" "), MAX_QUERY_LENGTH);
}

export async function searchDeepSeek(input: {
  query: string;
  originalQuestion?: string;
  count?: number;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildEndpoint(resolveBaseUrl(input.baseUrl), "tools/search"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: unicodeSlice(input.query, MAX_QUERY_LENGTH),
        count: Math.max(1, Math.min(50, input.count ?? DEFAULT_COUNT)),
        ori_question: input.originalQuestion
          ? unicodeSlice(input.originalQuestion, MAX_QUERY_LENGTH)
          : null,
        need_content: false,
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`search_http_${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const results = Array.isArray(data.results)
    ? data.results
        .map(normalizeSearchResult)
        .filter((item): item is WebSearchResult => Boolean(item))
        .slice(0, MAX_RESULTS)
    : [];
  return { results };
}

export async function fetchDeepSeekPage(input: {
  url: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildEndpoint(resolveBaseUrl(input.baseUrl), "tools/fetch"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: input.url }),
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`fetch_http_${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    title: readString(data.title, 300) || input.url,
    content: readString(data.content, 4_000),
  };
}

export async function collectPlanWebEvidence(
  input: WebEvidenceInput,
): Promise<PlanWebEvidence> {
  const query = buildWebSearchQuery(input);
  const signal = buildToolSignal(input);
  const route = routeTool(signal);
  const fetchedAt = new Date().toISOString();
  const enabled =
    input.enabled ?? (process.env.WEB_SEARCH_ENABLED !== "false");
  const apiKey = resolveApiKey(input.apiKey);
  const baseUrl = resolveBaseUrl(input.baseUrl);

  if (
    !enabled ||
    route.kind === "none" ||
    (route.policy !== "read" && route.policy !== "confirm-write")
  ) {
    return {
      status: "skipped",
      kind: route.kind,
      query,
      results: [],
      fetchedAt,
    };
  }
  if (!apiKey) {
    return {
      status: "failed",
      kind: route.kind,
      query,
      results: [],
      error: "missing_api_key",
      fetchedAt,
    };
  }

  const url = extractFirstUrl(signal);
  try {
    if (route.kind === "read" && url) {
      const page = await fetchDeepSeekPage({
        url,
        apiKey,
        baseUrl,
        timeoutMs: input.timeoutMs,
        fetchImpl: input.fetchImpl,
      });
      return {
        status: page.content ? "ok" : "empty",
        kind: route.kind,
        query,
        fetchedUrl: url,
        results: page.content
          ? [
              {
                title: page.title,
                url,
                snippet: page.content.slice(0, 500),
                summary: page.content,
                siteName: null,
                publishedAt: null,
                authority: -1,
                rerankScore: 0,
              },
            ]
          : [],
        fetchedAt,
      };
    }

    const { results } = await searchDeepSeek({
      query,
      originalQuestion: input.content,
      count: DEFAULT_COUNT,
      apiKey,
      baseUrl,
      timeoutMs: input.timeoutMs,
      fetchImpl: input.fetchImpl,
    });
    return {
      status: results.length ? "ok" : "empty",
      kind: route.kind,
      query,
      results,
      fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "search_failed";
    console.warn("[web-search] failed", message);
    return {
      status: "failed",
      kind: route.kind,
      query,
      results: [],
      fetchedUrl: url ?? undefined,
      error: message,
      fetchedAt,
    };
  }
}

export function webEvidenceForModel(evidence: PlanWebEvidence | null | undefined) {
  if (!evidence) return null;
  return {
    status: evidence.status,
    kind: evidence.kind,
    query: evidence.query,
    fetchedUrl: evidence.fetchedUrl ?? null,
    error: evidence.error ?? null,
    fetchedAt: evidence.fetchedAt,
    results: evidence.results.map((result) => ({
      title: result.title,
      url: result.url,
      summary: result.summary || result.snippet,
      siteName: result.siteName,
      publishedAt: result.publishedAt,
      authority: result.authority,
      rerankScore: result.rerankScore,
    })),
  };
}

export function webEvidenceSources(
  evidence: PlanWebEvidence | null | undefined,
): InboxPlanSourceLink[] {
  if (!evidence?.results.length) return [];
  return evidence.results.slice(0, MAX_RESULTS).map((result) => ({
    title: result.title,
    url: result.url,
    siteName: result.siteName,
    publishedAt: result.publishedAt,
    authority: result.authority,
  }));
}

export function webEvidenceNote(evidence: PlanWebEvidence | null | undefined) {
  const sources = webEvidenceSources(evidence);
  if (!sources.length) return "";
  return [
    "参考来源：",
    ...sources.map((source) => `- ${source.title} — ${source.url}`),
  ].join("\n");
}

export function attachWebEvidenceSources(
  plan: InboxPlan,
  evidence: PlanWebEvidence | null | undefined,
) {
  const note = webEvidenceNote(evidence);
  if (!note || !plan.tasks.length) return plan;
  const firstTask = plan.tasks[0];
  if (firstTask.notes?.includes(note)) return plan;
  firstTask.notes = firstTask.notes
    ? `${firstTask.notes}\n\n${note}`
    : note;
  return plan;
}