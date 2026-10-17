"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Loader2, Send, Sparkles } from "lucide-react";
import { useRotatingText } from "@/components/rotating-text";
import type {
  InboxClarificationDimension,
  InboxClarificationFrame,
  InboxClarificationHistoryItem,
} from "@/lib/ai";

type Props = {
  dimensions: InboxClarificationDimension[];
  supplementPlaceholder: string;
  busy?: boolean;
  submitLabel?: string;
  initialHistory?: InboxClarificationHistoryItem[];
  clarificationStatus?: "asking" | "done";
  frame?: InboxClarificationFrame | null;
  /** 首页原始想法，作为对话的第一条用户消息展示 */
  userMessage?: string;
  /** 澄清完成后直接进入自动整理，不再显示「生成任务」按钮 */
  autoSubmit?: boolean;
  /** 自动整理尚未就绪时也先隐藏手动提交按钮，避免闪一下 */
  hideSubmitAction?: boolean;
  /** 生成计划/任务时的流式预览文本 */
  previewText?: string;
  onNext?: (payload: {
    answer: string[];
    history: InboxClarificationHistoryItem[];
    questionKey?: string;
  }) => Promise<{
    status: "asking" | "done";
    question?: InboxClarificationDimension | null;
    reflection?: string | null;
  }>;
  onSubmit: (payload: { answers: string[][]; supplement: string }) => void;
};

type Turn = {
  role: "ai" | "user";
  text: string;
  reflection?: string;
  options?: string[];
  multi?: boolean;
  key?: string;
};

const TYPING_MS = 600;
const CLARIFY_WAITING_LABELS = ["正在想下一个问题...", "快好了..."];
const PLAN_WAITING_LABELS = ["正在整理...", "快好了..."];

function initialAnswers(history: InboxClarificationHistoryItem[]) {
  return history
    .filter((item) => item.answer.length)
    .map((item) => item.answer);
}

function buildInitialTurns(
  dimensions: InboxClarificationDimension[],
  history: InboxClarificationHistoryItem[],
  userMessage?: string,
): Turn[] {
  const turns: Turn[] = userMessage?.trim()
    ? [{ role: "user", text: userMessage.trim() }]
    : [];

  if (history.length) {
    for (const item of history) {
      turns.push({
        role: "ai",
        text: item.question,
        reflection: item.reflection ?? undefined,
        options: item.answer.length ? undefined : item.options,
        multi: item.multi,
        key: item.key,
      });
      if (item.answer.length) {
        turns.push({ role: "user", text: item.answer.join("、") });
      }
    }
    return turns;
  }

  if (dimensions.length) {
    turns.push({
      role: "ai",
      text: dimensions[0].question,
      options: dimensions[0].options,
      multi: dimensions[0].multi,
      key: dimensions[0].key,
    });
  }
  return turns;
}

export function ChatClarify({
  dimensions,
  busy = false,
  submitLabel = "看看怎么走",
  initialHistory = [],
  clarificationStatus,
  frame = null,
  userMessage,
  autoSubmit = false,
  hideSubmitAction = false,
  previewText = "",
  onNext,
  onSubmit,
}: Props) {
  const [turns, setTurns] = useState<Turn[]>(() =>
    buildInitialTurns(dimensions, initialHistory, userMessage),
  );
  const [answers, setAnswers] = useState<string[][]>(() =>
    initialAnswers(initialHistory),
  );
  const [history, setHistory] =
    useState<InboxClarificationHistoryItem[]>(initialHistory);
  const [pending, setPending] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(
    clarificationStatus === "done" ||
      (!initialHistory.length && dimensions.length === 0),
  );
  const [typed, setTyped] = useState("");
  const [directInput, setDirectInput] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSubmittedRef = useRef(false);
  const waitingLabel = useRotatingText(busy, PLAN_WAITING_LABELS);
  const clarifyWaitingLabel = useRotatingText(
    thinking && Boolean(onNext),
    CLARIFY_WAITING_LABELS,
  );

  const answeredCount = answers.length;
  const lastTurn = turns[turns.length - 1];
  const isMulti = Boolean(lastTurn?.role === "ai" && lastTurn.multi);
  const showOptions = Boolean(
    lastTurn?.role === "ai" && lastTurn.options?.length && !done,
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns, thinking, done, busy]);

  useEffect(() => {
    if (!autoSubmit || !done || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void onSubmit({ answers, supplement: "" });
  }, [answers, autoSubmit, done, onSubmit]);

  function toggle(option: string) {
    if (busy || thinking) return;
    setPending((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    );
  }

  async function commit(answer: string[]) {
    if (busy || thinking || !answer.length) return;
    const currentTurn = lastTurn;
    const previousAnswers = answers;
    const previousHistory = history;
    const all = [...answers, answer];
    const nextHistory = history.map((item) =>
      item.answer.length === 0 ? { ...item, answer } : item,
    );

    setTurns((current) => [
      ...current,
      { role: "user", text: answer.join("、") },
    ]);
    setAnswers(all);
    if (onNext) setHistory(nextHistory);
    setPending([]);
    setTyped("");
    setDirectInput(false);
    setThinking(true);

    if (onNext) {
      try {
        const result = await onNext({
          answer,
          history: nextHistory,
          questionKey: currentTurn?.key,
        });
        if (result.status === "done") {
          setDone(true);
          setTurns((current) => [
            ...current,
            {
              role: "ai",
              text: "明白了，已整理完成",
            },
          ]);
        } else if (result.question) {
          const nextHistoryItem: InboxClarificationHistoryItem = {
            ...result.question,
            answer: [],
            reflection: result.reflection ?? null,
          };
          setHistory([...nextHistory, nextHistoryItem]);
          setTurns((current) => [
            ...current,
            {
              role: "ai",
              text: result.question?.question ?? "",
              reflection: result.reflection ?? undefined,
              options: result.question?.options,
              multi: result.question?.multi,
              key: result.question?.key,
            },
          ]);
        } else {
          throw new Error("missing_question");
        }
      } catch {
        // 回滚这次乐观提交；服务端已处理时会通过幂等接口返回当前状态。
        setTurns((current) => {
          const base =
            current.at(-1)?.role === "user"
              ? current.slice(0, -1)
              : current;
          return [
            ...base,
            {
              role: "ai",
              text: "网络没接上，点下面的选项重试一次。",
              options: currentTurn?.options,
              multi: currentTurn?.multi,
              key: currentTurn?.key,
            },
          ];
        });
        setAnswers(previousAnswers);
        setHistory(previousHistory);
      } finally {
        setThinking(false);
      }
      return;
    }

    const nextAnswered = answeredCount + 1;
    const isLast = nextAnswered >= dimensions.length;
    window.setTimeout(() => {
      setThinking(false);
      if (!isLast) {
        const next = dimensions[nextAnswered];
        setTurns((current) => [
          ...current,
          {
            role: "ai",
            text: next.question,
            options: next.options,
            multi: next.multi,
            key: next.key,
          },
        ]);
      } else {
        setDone(true);
        setTurns((current) => [
          ...current,
          {
            role: "ai",
            text: "信息够了，我按刚才确认的边界往下整理。",
          },
        ]);
      }
    }, TYPING_MS);
  }

  function submitDirect() {
    if (!typed.trim() || busy || thinking) return;
    void commit([typed.trim()]);
  }

  function toggleDirectInput() {
    if (busy || thinking) return;
    if (directInput) {
      setTyped("");
      setDirectInput(false);
      return;
    }
    setDirectInput(true);
  }

  function submitAll() {
    if (busy) return;
    onSubmit({ answers, supplement: "" });
  }

  return (
    // 只保留对话本身：不再有「先确认一件事 / 第 N 问」这类说明条
    <div className="overflow-hidden">
      <div
        ref={scrollRef}
        className="max-h-[420px] space-y-3 overflow-y-auto"
      >
        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <div
              key={index}
              className="ml-auto flex max-w-[82%] justify-end"
            >
              <div className="rounded-xl rounded-tr-sm border border-border bg-surface-muted px-3 py-2 text-sm font-medium leading-6 text-ink">
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={index} className="flex justify-start">
              <div className="flex max-w-full items-start gap-2">
                <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-strong">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="min-w-0 max-w-full">
                  <div className="rounded-xl rounded-tl-sm border border-border/70 bg-surface px-3 py-2.5 text-sm leading-6 text-ink">

                    <span className="whitespace-pre-wrap">{turn.text}</span>
                  </div>
                  {showOptions && index === turns.length - 1 ? (
                    <div className="mt-2" data-tour="clarify-options">
                      <div className="flex flex-wrap items-center gap-2">
                        {turn.options?.map((option) => {
                          const selected = pending.includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() =>
                                isMulti ? toggle(option) : void commit([option])
                              }
                              disabled={busy || thinking}
                              className={
                                selected
                                  ? "inline-flex items-center gap-1.5 rounded-lg border-2 border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-accent-strong transition-colors"
                                  : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                              }
                            >
                              {selected ? <Check className="size-3.5" /> : null}
                              {option}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={toggleDirectInput}
                          disabled={busy || thinking}
                          aria-expanded={directInput}
                          className={
                            directInput
                              ? "inline-flex items-center gap-1.5 rounded-lg border-2 border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-accent-strong transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                          }
                        >
                          <CornerDownLeft className="size-3.5" />
                          想自己说
                        </button>
                      </div>
                      {isMulti ? (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-[11px] text-ink-muted">可多选</p>
                          <button
                            type="button"
                            onClick={() => void commit(pending)}
                            disabled={!pending.length || busy || thinking}
                            className="zouzou-primary-button inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check className="size-3.5" />
                            确定
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ),
        )}

        {thinking ? (
          <div className="text-sm leading-6 text-ink-muted">
            {previewText ? (
              <p className="whitespace-pre-wrap text-ink-secondary">{previewText}</p>
            ) : (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
                <span>{onNext ? clarifyWaitingLabel : waitingLabel}</span>
              </span>
            )}
          </div>
        ) : null}

        {directInput && showOptions ? (
          <div className="flex justify-start pl-8">
            <form
              className="flex w-full max-w-[82%] items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitDirect();
              }}
            >
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="输入你想说的话"
                className="zouzou-input min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-ink"
                autoFocus
              />
              <button
                type="submit"
                disabled={!typed.trim() || busy || thinking}
                className="zouzou-primary-button inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="发送"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        ) : null}

        {done && !autoSubmit && !hideSubmitAction ? (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={submitAll}
              disabled={busy}
              className={`zouzou-primary-button inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 ${
                busy
                  ? ""
                  : "animate-[zouzou-attention_1.8s_ease-in-out_infinite]"
              }`}
            >
              {busy ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex gap-1">
                    <span className="size-1 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-white" />
                    <span className="size-1 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-white [animation-delay:160ms]" />
                    <span className="size-1 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-white [animation-delay:320ms]" />
                  </span>
                  {waitingLabel}
                </span>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
