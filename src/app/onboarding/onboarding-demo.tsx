"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { startGuestExperience } from "@/app/actions";
import { savePendingIdea } from "@/lib/pending-idea";
import { ChatClarify } from "@/components/chat-clarify";

type Stage = "capture" | "ask" | "planning" | "prompt" | "received";

type Plan = {
  projectName: string;
  objective: string;
  milestone: string;
  tasks: Array<{
    title: string;
    time: string;
    priority: string;
  }>;
};

const messyThoughts = [
  "我想做一个自己的网站",
  "最近又想学英语",
  "还想开始健身",
  "小红书好像也可以做？",
  "但每天下班后已经很累",
  "不知道先做哪个",
  "又怕给自己排太多",
];

type DirectionOption = {
  key: string;
  label: string;
  hint: string;
};

function directionOptionsFor(thought: string): DirectionOption[] {
  const lower = thought.toLowerCase();
  const options: DirectionOption[] = [];

  if (/(网站|作品集|个人主页|博客)/.test(lower)) {
    options.push({
      key: "website",
      label: "先做个人网站",
      hint: "想有一个能展示自己的作品",
    });
  }
  if (/(英语|英文|口语|雅思|托福)/.test(lower)) {
    options.push({
      key: "english",
      label: "先学英语",
      hint: "更想先把语言能力补起来",
    });
  }
  if (/(健身|运动|跑步|减脂|增肌|锻炼)/.test(lower)) {
    options.push({
      key: "fitness",
      label: "先开始健身",
      hint: "先把身体状态和日常节奏带起来",
    });
  }
  if (/(小红书|抖音|自媒体|视频|账号|公众号)/.test(lower)) {
    options.push({
      key: "content",
      label: "先做内容账号",
      hint: "想有一个能持续输出的方向",
    });
  }

  options.push({
    key: "custom",
    label: "按我输入的内容继续",
    hint: "就从你刚刚说的那句话开始",
  });

  return options;
}

const thoughtPrompts = [
  {
    label: "我想做…",
    placeholder: "比如：我想做一个能展示作品的个人网站。",
  },
  {
    label: "最近让我分心的是…",
    placeholder: "比如：我总在收集素材，但没有真正开始输出。",
  },
  {
    label: "如果这周只做一件事…",
    placeholder: "比如：如果这周只做一件事，我会先完成网站首页。",
  },
  {
    label: "我真正想要的是…",
    placeholder: "比如：我真正想要的不是更多工具，而是有一个能持续完成的项目。",
  },
  {
    label: "一直拖着没开始的是…",
    placeholder: "比如：我一直想整理作品集，但总觉得还没准备好。",
  },
];

const plans: Record<string, Plan> = {
  website: {
    projectName: "个人网站 V1",
    objective: "两周内上线一个能展示作品、说明能力的个人网站。",
    milestone: "本周完成定位和内容，下周完成搭建与上线。",
    tasks: [
      {
        title: "写下网站的一句话定位",
        time: "15 分钟",
        priority: "今日第一步",
      },
      {
        title: "整理 3-5 个代表作品",
        time: "1-2 小时",
        priority: "高",
      },
      {
        title: "选择搭建方式并搭好首页骨架",
        time: "2-3 小时",
        priority: "高",
      },
      {
        title: "补齐联系方式和项目说明",
        time: "30 分钟",
        priority: "中",
      },
    ],
  },
  english: {
    projectName: "英语日常表达",
    objective: "三个月内能用英语完成日常对话和短写作。",
    milestone: "前两周建立每日 30 分钟输入习惯，并完成第一轮主题表达。",
    tasks: [
      {
        title: "定一个你最常用的场景主题",
        time: "10 分钟",
        priority: "今日第一步",
      },
      {
        title: "准备 10 个场景短句并朗读",
        time: "20 分钟",
        priority: "高",
      },
      {
        title: "找一个能对话的 AI 练习伙伴",
        time: "15 分钟",
        priority: "中",
      },
      {
        title: "把不会的词整理成一张表",
        time: "20 分钟",
        priority: "低",
      },
    ],
  },
  fitness: {
    projectName: "日常健身启动",
    objective: "把运动变成一件不用纠结就能开始的小事，先建立稳定节奏。",
    milestone: "先完成第一周两次 15 分钟低门槛运动。",
    tasks: [
      {
        title: "定一个最容易开始的时间和动作",
        time: "10 分钟",
        priority: "今日第一步",
      },
      {
        title: "只做 15 分钟，不要求练得多完整",
        time: "15 分钟",
        priority: "高",
      },
      {
        title: "记录今天做完后的身体感受",
        time: "5 分钟",
        priority: "中",
      },
    ],
  },
  content: {
    projectName: "内容账号启动",
    objective: "先找到一个能持续输出的内容方向，并完成第一期可发布的样稿。",
    milestone: "本周完成一个主题方向和第一期开头。",
    tasks: [
      {
        title: "选一个你最想持续聊的方向",
        time: "10 分钟",
        priority: "今日第一步",
      },
      {
        title: "写下这个方向能帮到谁、解决什么问题",
        time: "15 分钟",
        priority: "高",
      },
      {
        title: "写第一期开头，不用写完整篇",
        time: "30 分钟",
        priority: "中",
      },
    ],
  },
  priority: {
    projectName: "想法梳理",
    objective: "先不急着增加新事，把现有想法归类，并决定哪些该做、哪些该删。",
    milestone: "本周完成一次个人目标盘点，选出 1 个重点推进项目。",
    tasks: [
      {
        title: "把现有想法按“想做 / 该做 / 可放弃”分类",
        time: "20 分钟",
        priority: "今日第一步",
      },
      {
        title: "选出本周只推进的一件重点",
        time: "10 分钟",
        priority: "高",
      },
      {
        title: "为其他想法设置“暂不处理”状态",
        time: "10 分钟",
        priority: "中",
      },
      {
        title: "写下为什么这件事比别的重要",
        time: "15 分钟",
        priority: "中",
      },
    ],
  },
};

function buildCustomPlan(thought: string): Plan {
  const firstLine =
    thought
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "这个想法";
  const short =
    firstLine.length > 18 ? `${firstLine.slice(0, 18)}…` : firstLine;

  return {
    projectName: `${short}起步`,
    objective: `把“${firstLine}”推进成一件今天能开始的事，先不看完整的最终目标。`,
    milestone: `让“${short}”出现第一个看得见的进展。`,
    tasks: [
      {
        title: `写下“${short}”今天能做的第一个动作`,
        time: "10 分钟",
        priority: "今日第一步",
      },
      {
        title: "只做这个动作 15 分钟，不做完整计划",
        time: "15 分钟",
        priority: "高",
      },
      {
        title: "把做完的结果或卡住的地方记下来",
        time: "5 分钟",
        priority: "中",
      },
    ],
  };
}

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2.5 text-sm leading-6 text-ink";

const primaryButtonClass =
  "zouzou-primary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50";

const ghostButtonClass =
  "zouzou-secondary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface-muted px-4 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink";

const textLinkClass =
  "inline-flex h-10 items-center justify-center px-1 text-sm font-medium text-ink-muted transition-colors hover:text-accent";

function demoClarifyDimensions(thought: string) {
  return [
    {
      key: "direction",
      question: "你真正想推进的是哪几件？可以多选。",
      options: directionOptionsFor(thought).map((option) => option.label),
      multi: true,
    },
    {
      key: "result",
      question: "这次你最想先得到什么结果？",
      options: [
        "一个能拿出手的成果",
        "先形成稳定节奏",
        "先确认这条路值不值得做",
      ],
    },
    {
      key: "rhythm",
      question: "你每天大概能投入多少时间？",
      options: ["10-15 分钟", "30 分钟左右", "1 小时以上", "看情况"],
    },
    {
      key: "blocker",
      question: "现在最卡住你的是什么？可以多选。",
      options: [
        "不知道从哪开始",
        "容易三分钟热度",
        "没时间",
        "怕做不好",
        "方向太多",
      ],
      multi: true,
    },
  ];
}

export function OnboardingDemo() {
  const [stage, setStage] = useState<Stage>("capture");
  const [thought, setThought] = useState(messyThoughts.join("\n"));
  const [selected, setSelected] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [userThought, setUserThought] = useState("");

  const plan = selected ? (plans[selected] ?? buildCustomPlan(thought)) : null;
  const directionOptions = directionOptionsFor(thought);

  function reset() {
    setStage("capture");
    setThought(messyThoughts.join("\n"));
    setSelected(null);
    setExtra("");
    setPromptIndex(0);
    setUserThought("");
  }

  const steps = ["说出想法", "问清处境", "收成行动", "记住你"];
  const stageIndex =
    stage === "capture"
      ? 0
      : stage === "ask"
        ? 1
        : stage === "planning"
          ? 2
          : 3;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto">
      <div className="mx-auto min-h-dvh w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-ai-soft px-2 py-1 text-xs font-medium text-ai">
              <Sparkles className="size-3.5" />
              首次交互演示
            </p>
            <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
              先别整理，先把你脑子里的东西倒出来。
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
              你不是不会计划，只是想法太多，缺一个先听懂你、再陪你推进的伙伴。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link
              href="/"
              className="zouzou-secondary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
            >
              返回走走
            </Link>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-4 gap-2">
          {steps.map((step, index) => (
            <div
              key={step}
              className={
                index <= stageIndex
                  ? "rounded-lg bg-accent-soft px-3 py-2 text-center text-xs font-medium text-accent-strong"
                  : "rounded-lg bg-surface-muted px-3 py-2 text-center text-xs font-medium text-ink-muted"
              }
            >
              <span className="mr-1.5 hidden sm:inline">{index + 1}.</span>
              {step}
            </div>
          ))}
        </div>

        {stage === "capture" ? (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="zouzou-panel rounded-xl p-5 sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">
                  你的脑子现在大概是这样
                </p>
                <span className="text-xs text-ink-muted">可编辑示例</span>
              </div>
              <textarea
                value={thought}
                onChange={(event) => {
                  setThought(event.target.value);
                  setSelected(null);
                  setExtra("");
                }}
                rows={9}
                className="zouzou-input min-h-52 resize-none px-4 py-3 text-base leading-7 text-ink"
              />
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className={primaryButtonClass}
                >
                  <Wand2 className="size-4" />
                  先聊聊这些想法
                </button>
              </div>
            </div>

            <aside className="zouzou-panel rounded-xl p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
                  <MessageSquareText className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">你不需要自己整理</p>
                  <p className="mt-1 text-sm leading-6 text-ink-secondary">
                    不用先建项目，不用写清楚任务，也不用懂怎么给 AI 下指令。
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {messyThoughts.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2 text-sm leading-6 text-ink-secondary"
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                    {item}
                  </div>
                ))}
              </div>

              <p className="zouzou-ai-card mt-6 px-3 py-2.5 text-xs leading-5 text-accent-strong">
                AI 会先记住你真正想做的事，再根据你的处境收成一个具体行动；卡住时它会帮你减负担，而不是继续催。
              </p>
            </aside>
          </section>
        ) : null}

        {stage === "ask" ? (
          <section className="zouzou-panel rounded-xl p-5 sm:p-6">
            <div className="mt-5">
                <ChatClarify
                dimensions={demoClarifyDimensions(thought)}
                supplementPlaceholder="也可以补充两句，比如你想先得到什么结果。"
                submitLabel="帮我收成行动"
                onSubmit={(payload) => {
                  const keys = (payload.answers[0] ?? [])
                    .map(
                      (label) =>
                        directionOptions.find((item) => item.label === label)
                          ?.key,
                    )
                    .filter((key): key is string => Boolean(key));
                  setSelected(keys[0] ?? null);
                  setExtra(payload.supplement);
                  setStage("planning");
                }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStage("prompt")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary transition-colors hover:text-accent"
              >
                <Lightbulb className="size-4" />
                我还没想清楚，换一种方式引导我
              </button>
            </div>
          </section>
        ) : null}

        {stage === "planning" && plan ? (
          <section className="zouzou-panel rounded-xl p-5 sm:p-6">
            <div>
              <p className="text-sm font-semibold text-ink">
                这是为你拆出的第一版推进路径
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                所有内容都可以修改。这个演示页不会写入真实数据。
              </p>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="zouzou-ai-card mb-4 px-3 py-2.5 text-xs leading-5 text-accent-strong">
                  你最初说：{thought.trim()}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    项目名称
                  </span>
                  <input
                    defaultValue={plan.projectName}
                    className={inputClass}
                  />
                </label>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    项目目标
                  </span>
                  <textarea
                    defaultValue={plan.objective}
                    rows={2}
                    className={inputClass}
                  />
                </label>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                    当前里程碑
                  </span>
                  <input
                    defaultValue={plan.milestone}
                    className={inputClass}
                  />
                </label>

                {extra.trim() ? (
                  <div className="zouzou-ai-card mt-4 px-3 py-2.5 text-xs leading-5 text-accent-strong">
                    已纳入你的补充：“{extra.trim()}”
                  </div>
                ) : null}
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <ListChecks className="size-4 text-accent" />
                  接下来要推进的
                </div>
                <div className="zouzou-panel mt-3 divide-y divide-border rounded-xl bg-surface-muted">
                  {plan.tasks.map((task, index) => (
                    <div
                      key={`${task.title}-${index}`}
                      className="flex items-center justify-between gap-3 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {index + 1}. {task.title}
                        </p>
                        <p className="mt-1 text-xs text-ink-secondary">
                          {task.priority}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs font-medium text-ink-secondary">
                        <Clock3 className="size-3.5" />
                        {task.time}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-lg bg-success/10 px-3 py-3 text-sm leading-6 text-success">
                  <Target className="mt-1 size-4 shrink-0" />
                  今日第一步：用 15 分钟完成第 1 条任务，不用做更多。
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <form
                action={startGuestExperience}
                onSubmit={() => savePendingIdea(userThought)}
              >
                <button type="submit" className={ghostButtonClass}>
                  先游客体验
                </button>
              </form>
              <Link
                href="/login?mode=register&next=/welcome"
                onClick={() => savePendingIdea(userThought)}
                className={primaryButtonClass}
              >
                注册并保存
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <p className="mt-3 text-right text-xs leading-5 text-ink-secondary">
              游客内容只保存在本机；注册后会长期保存，也不用重写。
            </p>
          </section>
        ) : null}

        {stage === "prompt" ? (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="zouzou-panel rounded-xl p-5 sm:p-6">
              <p className="text-sm font-semibold text-ink">
                如果你还没想清楚，试着换一种问法
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                选一个提示词，从你最自然的表达开始。
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {thoughtPrompts.map((prompt, index) => {
                  const active = promptIndex === index;
                  return (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => setPromptIndex(index)}
                      className={
                        active
                          ? "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-ink transition-colors"
                          : "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                      }
                    >
                      {prompt.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={userThought}
                onChange={(event) => setUserThought(event.target.value)}
                rows={7}
                placeholder={thoughtPrompts[promptIndex].placeholder}
                className="zouzou-input mt-5 min-h-44 w-full resize-none px-4 py-3 text-base leading-7 text-ink"
              />

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="text-sm font-medium text-ink-secondary transition-colors hover:text-accent"
                >
                  ← 返回 AI 提问
                </button>
                <button
                  type="button"
                  onClick={() => setStage("received")}
                  disabled={!userThought.trim()}
                  className={primaryButtonClass}
                >
                  <Wand2 className="size-4" />
                  陪我想清楚
                </button>
              </div>
            </div>

            <aside className="zouzou-panel rounded-xl p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                  <Lightbulb className="size-4" />
                </span>
                <p className="text-sm leading-6 text-ink-secondary">
                  提示词不是给 AI 用的，是给你自己用的。换一种说法，可能会让你想起真正在意的事。
                </p>
              </div>
            </aside>
          </section>
        ) : null}

        {stage === "received" ? (
          <section className="zouzou-panel mx-auto max-w-2xl rounded-xl p-6 text-center sm:p-8">
            <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-accent text-white">
              <Sparkles className="size-5" />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-ink">
              我已经收到你的方向
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-ink">
              “{userThought.trim()}”
            </p>
            <p className="mt-4 text-sm leading-6 text-ink-secondary">
              AI 接下来会先确认目标、时间投入和真正卡住的地方，再陪你选择最适合的推进方式，不会直接替你决定，也不会把日程排满。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={reset}
                className={textLinkClass}
              >
                重新演示一次
              </button>
              <form
                action={startGuestExperience}
                onSubmit={() => savePendingIdea(userThought)}
              >
                <button type="submit" className={ghostButtonClass}>
                  先游客体验
                </button>
              </form>
              <Link
                href="/login?mode=register&next=/welcome"
                onClick={() => savePendingIdea(userThought)}
                className={primaryButtonClass}
              >
                注册并保存
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-secondary">
              游客内容只保存在本机；注册后会长期保存，也不用重写。
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}



