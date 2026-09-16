"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FolderKanban,
  ListTodo,
  MessageSquareText,
  NotebookPen,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  clarifyOnboarding,
  completeFirstRun,
  planOnboarding,
  skipOnboarding,
} from "@/app/actions";
import { BrandMark } from "@/components/brand-mark";
import { ChatClarify } from "@/components/chat-clarify";
import { takePendingIdea } from "@/lib/pending-idea";
import {
  pickRandomSampleIdeas,
  sampleIdeasForDate,
} from "@/lib/sample-ideas";
import { SubmitButton } from "@/components/submit-button";
import type { InboxClarification } from "@/lib/ai";

const steps = [
  { label: "写想法", icon: NotebookPen },
  { label: "谈感受", icon: MessageSquareText },
  { label: "建项目", icon: FolderKanban },
  { label: "定今日", icon: ListTodo },
];

const inputClass =
  "zouzou-input w-full rounded-lg px-3.5 py-3 text-[15px] leading-7 text-ink";

export function FirstRunGuide({ guest }: { guest?: boolean }) {
  const [step, setStep] = useState(0);
  const [idea, setIdea] = useState("");
  const [clarification, setClarification] = useState<InboxClarification | null>(
    null,
  );
  const [projectName, setProjectName] = useState("");
  const [objective, setObjective] = useState("");
  const [milestone, setMilestone] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskShortTitle, setTaskShortTitle] = useState("");
  const [planSourceIdea, setPlanSourceIdea] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiFallback, setAiFallback] = useState(false);
  const [samples, setSamples] = useState(sampleIdeasForDate);

  useEffect(() => {
    try {
      localStorage.setItem("next_step_new_user", "1");
    } catch {
      // Ignore storage errors and continue the setup flow.
    }

    // 演示页/落地页里写过的那句话，直接带过来预填，避免用户重写一遍
    const pending = takePendingIdea();
    if (pending) {
      setIdea((current) => (current.trim() ? current : pending));
    }
  }, []);

  const trimmedIdea = idea.trim().replace(/\s+/g, " ");

  function handleIdeaChange(value: string) {
    setIdea(value);
    setClarification(null);
    setPlanSourceIdea("");
    setAiFallback(false);
  }

  async function finishClarify(ideaValue: string, choices: string[]) {
    setGenerating(true);
    const prompt = choices.length
      ? `${ideaValue}\n方向倾向：${choices.join("、")}`
      : ideaValue;
    try {
      const nextPlan = await planOnboarding(prompt);
      setAiFallback(nextPlan.usedFallback);
      setPlanSourceIdea(ideaValue);
      setProjectName(nextPlan.projectName);
      setObjective(nextPlan.objective);
      setMilestone(nextPlan.milestone);
      setTaskTitle(nextPlan.taskTitle);
      setTaskShortTitle(nextPlan.taskShortTitle);
      setStep(2);
    } catch {
      setAiFallback(true);
      setPlanSourceIdea(ideaValue);
      setProjectName(ideaValue.slice(0, 12) || "第一个项目");
      setObjective(`把“${ideaValue}”推进成今天能做的一件事。`);
      setMilestone("开始推进");
      setTaskTitle(`把「${ideaValue}」里最影响推进的地方写成一句话`);
      setStep(2);
    } finally {
      setGenerating(false);
    }
  }

  async function startClarify() {
    if (!trimmedIdea || generating) return;
    setGenerating(true);
    try {
      const nextClarification = await clarifyOnboarding(trimmedIdea);
      setClarification(nextClarification);
      if (nextClarification.dimensions.length) {
        setStep(1);
      } else {
        await finishClarify(trimmedIdea, []);
      }
    } catch {
      await finishClarify(trimmedIdea, []);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto">
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl">
          {guest ? (
            <div className="zouzou-panel mb-4 flex items-center justify-between gap-3 rounded-xl border-accent/25 bg-accent-soft px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-accent-strong">
                  游客体验中
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-secondary">
                  注册正式账号后，这个体验里的内容可以继续保存。
                </p>
              </div>
              <Link
                href="/guest/register"
                className="zouzou-primary-button inline-flex h-9 shrink-0 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                注册保存
              </Link>
            </div>
          ) : null}

          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BrandMark className="size-9" />
              <div>
                <span className="block text-base font-semibold text-ink">走走</span>
                <span className="block text-xs text-ink-muted">
                  让想法，走成下一步
                </span>
              </div>
            </div>
            <form action={skipOnboarding}>
              <SubmitButton
                pendingText="..."
                className="zouzou-secondary-button inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
              >
                跳过
              </SubmitButton>
            </form>
          </div>

          <div className="mb-6 grid grid-cols-4 gap-2.5">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const active = index <= step;

              return (
                <div
                  key={item.label}
                  className={
                    active
                      ? "flex items-center justify-center gap-1.5 rounded-lg bg-accent-soft px-3.5 py-2.5 text-sm font-medium text-accent-strong"
                      : "flex items-center justify-center gap-1.5 rounded-lg bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink-muted"
                  }
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">{item.label}</span>
                </div>
              );
            })}
          </div>

          <div className="zouzou-panel rounded-xl p-6 sm:p-8">
            {step === 0 ? (
              <div>
                <p className="text-base font-semibold text-ink">
                  写想法
                </p>
                <textarea
                  autoFocus
                  value={idea}
                  onChange={(event) => handleIdeaChange(event.target.value)}
                  rows={4}
                  placeholder="比如：整理自己的个人网站"
                  className={`${inputClass} mt-3 resize-none`}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {samples.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => handleIdeaChange(sample)}
                      className="max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs leading-5 text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setSamples(pickRandomSampleIdeas())}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                  >
                    <RefreshCw className="size-3.5" />
                    换一批
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={startClarify}
                    disabled={!trimmedIdea || generating}
                    className="zouzou-primary-button inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Sparkles className="size-4 animate-pulse" />
                        正在理解你...
                      </>
                    ) : (
                      <>
                        下一步
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {step === 1 && clarification ? (
              <div className="space-y-3">
                <p className="text-base font-semibold text-ink">
                  谈感受
                </p>
                <ChatClarify
                  dimensions={clarification.dimensions}
                  supplementPlaceholder={clarification.supplementPlaceholder}
                  busy={generating}
                  submitLabel="下一步"
                  onSubmit={(payload) =>
                    finishClarify(trimmedIdea, payload.answers.flat())
                  }
                />
              </div>
            ) : null}

            {step === 2 ? (
              <div>
                <p className="text-base font-semibold text-ink">
                  建项目
                </p>
                {aiFallback ? (
                  <div className="mt-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                    暂时连不上，先用本地整理，结果可继续修改。
                  </div>
                ) : null}
                <div className="zouzou-ai-card mt-3 px-3 py-2.5 text-xs leading-5 text-accent-strong">
                  你最初说：{planSourceIdea}
                </div>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    项目名
                  </span>
                  <input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    maxLength={40}
                    className={inputClass}
                  />
                </label>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    目标
                  </span>
                  <textarea
                    value={objective}
                    onChange={(event) => setObjective(event.target.value)}
                     rows={4}
                     maxLength={200}
                     className={`${inputClass} resize-y`}
                  />
                </label>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    里程碑
                  </span>
                  <input
                    value={milestone}
                    onChange={(event) => setMilestone(event.target.value)}
                    maxLength={80}
                    className={inputClass}
                  />
                </label>
                <div className="mt-5 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    disabled={!projectName.trim() || !objective.trim()}
                    className="zouzou-primary-button inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一步
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <form action={completeFirstRun}>
                <input type="hidden" name="projectName" value={projectName.trim()} />
                <input type="hidden" name="objective" value={objective.trim()} />
                <input type="hidden" name="milestone" value={milestone.trim()} />
                <input type="hidden" name="sourceIdea" value={planSourceIdea} />
                <input
                  type="hidden"
                  name="taskShortTitle"
                  value={taskShortTitle}
                />
                <p className="text-base font-semibold text-ink">
                  定今日
                </p>
                <label className="mt-3 block">
                  <span className="mb-2 block text-xs font-medium text-ink-secondary">
                    今日任务
                  </span>
                  <textarea
                    name="taskTitle"
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    rows={3}
                    maxLength={200}
                    className={`${inputClass} resize-none`}
                  />
                </label>
                <div className="mt-5 flex justify-end">
                  <SubmitButton
                    pendingText="正在创建..."
                    disabled={!taskTitle.trim()}
                    className="zouzou-primary-button inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
                  >
                    完成，去书桌查看
                    <Check className="size-4" />
                  </SubmitButton>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
