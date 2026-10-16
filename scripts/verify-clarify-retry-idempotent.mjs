import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, issueSessionToken } from "@/lib/session";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";

async function postClarify(itemId, answer, cookie, questionKey) {
  const response = await fetch(`${baseUrl}/api/ai/inbox/clarify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      itemId,
      mode: "socratic",
      answer,
      questionKey,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  let result = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "error") {
      throw new Error(event.message || "stream_error");
    }
    if (event.type === "done") result = event.result;
  }
  if (!result?.clarification) {
    throw new Error("NDJSON 流里没有 clarification");
  }
  return result.clarification;
}

function unansweredKey(clarification) {
  return clarification.history?.find((item) => !item.answer.length)?.key ?? null;
}

const user = await prisma.user.create({
  data: {
    username: `verify_retry_${Date.now()}`,
    passwordHash: "verify:not-for-login",
  },
  select: { id: true },
});

try {
  const itemId = randomUUID();
  await prisma.inboxItem.create({
    data: {
      id: itemId,
      userId: user.id,
      content: "我想换工作，但还没想好要不要考公。",
      source: "manual",
      aiSuggestionJson: JSON.stringify({
        dimensions: [],
        supplementPlaceholder: "",
        mode: "socratic",
        status: "asking",
        askedCount: 0,
        maxQuestions: 4,
        history: [
          {
            key: "goal",
            question: "你现在更想先推进换工作，还是准备考公？",
            options: ["换工作", "考公", "还没想好"],
            answer: [],
            reflection: null,
          },
        ],
        translation: null,
        frame: null,
        session: null,
        workMode: null,
      }),
      aiAnalyzedAt: new Date(),
    },
  });

  const cookie = `${SESSION_COOKIE}=${issueSessionToken(user.id)}`;
  const first = await postClarify(itemId, ["还没想好"], cookie, "goal");
  const firstNextKey = unansweredKey(first);
  const second = await postClarify(itemId, ["还没想好"], cookie, "goal");

  if (first.status === "done" && second.status !== "done") {
    throw new Error(`第一次已收口，重试却回到 ${second.status}`);
  }
  if (first.status === "asking") {
    const secondNextKey = unansweredKey(second);
    if (secondNextKey !== firstNextKey) {
      throw new Error("重复回答被错误地填进了下一轮新问题");
    }
  }
  console.log(
    `PASS clarify-retry-idempotent first=${first.status} second=${second.status} next=${firstNextKey}`,
  );
} finally {
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
}
