"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ListTodo,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { cx } from "@/lib/utils";

type DemoTask = {
  title: string;
  time: string;
  note: string;
};

type DemoScenario = {
  id: string;
  tab: string;
  idea: string;
  clarify: {
    intro: string;
    question: string;
    options: string[];
    selected: number;
    followUp: string;
    followUpOptions: string[];
    followUpSelected: number;
  };
  plan: {
    intro: string;
    projectName: string;
    objective: string;
    milestone: string;
    boundary: string;
    tasks: DemoTask[];
    nextStep: string;
  };
  review: {
    progress: string;
    insight: string;
    nextAction: string;
  };
};

function splitDemoInput(value: string) {
  const middle = Math.floor(value.length / 2);
  const punctuation = new Set(["。", "！", "？", "；"]);
  let splitAt = -1;

  for (let index = 0; index < value.length; index += 1) {
    if (!punctuation.has(value[index])) continue;
    if (splitAt === -1 || Math.abs(index - middle) < Math.abs(splitAt - middle)) {
      splitAt = index;
    }
  }

  if (splitAt < 0) {
    return [value.slice(0, middle), value.slice(middle)];
  }

  return [value.slice(0, splitAt + 1), value.slice(splitAt + 1)];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "tools",
    tab: "工具过载",
    idea: "最近收藏了十几个 AI 工具和教程，想搭一套自己的效率流程。每个看起来都有用，但一周过去还是照着旧方式做事，收藏夹越来越乱。",
    clarify: {
      intro: "你卡住的不是工具不够，而是没有把工具放进一个真实任务里验证。先确定想改善哪段流程，再决定哪些值得留下。",
      question: "如果只改善一个环节，你最想先解决什么？",
      options: ["从零开始一项任务", "处理大量资料和会议", "把想法快速整理成产出"],
      selected: 1,
      followUp: "你更想先得到哪种判断？",
      followUpOptions: ["哪个工具真的省时间", "哪种流程自己坚持得了", "哪些工具可以暂时不用"],
      followUpSelected: 2,
    },
    plan: {
      intro: "好，这次不追新工具。先拿你每周真实会做的资料整理任务，做一次 A/B 对照。",
      projectName: "AI 资料流瘦身",
      objective: "把现有工具放进一个真实任务里比较，留下最少、最顺的一套流程。",
      milestone: "完成一次真实资料整理，并写出保留与淘汰清单",
      boundary: "这次先不比较所有工具，也不研究新功能",
      tasks: [
        { title: "选一份这周必须处理的资料", time: "10 分钟", note: "用真实任务，不用收藏夹里的示例" },
        { title: "用现在的方法和另一个工具各处理一次", time: "30 分钟", note: "只记录耗时、卡点和最后能不能用" },
        { title: "留下 2 个工具，写下淘汰理由", time: "10 分钟", note: "标准不是功能多，而是下次你还会不会打开" },
      ],
      nextStep: "选一份这周必须处理的资料",
    },
    review: {
      progress: "今天真正推进的是把工具焦虑收回到一个真实资料任务，卡在比较时容易又被新功能带走。",
      insight: "判断已经明确：保留的工具必须能减少一次复制粘贴或一次重复整理。",
      nextAction: "按留下的流程再处理一份资料，连续验证两次。",
    },
  },
  {
    id: "conversation",
    tab: "关系沟通",
    idea: "我和室友最近总因为公共区域谁收拾而别扭。表面上都说没事，但垃圾和餐具经常放到第二天，我现在一想到开口就觉得很尴尬。",
    clarify: {
      intro: "这件事不是简单分工，而是既要把问题说清楚，又不想让关系变成互相指责。我们先确定你真正想改变的边界。",
      question: "这次你最希望谈清楚什么？",
      options: ["各自负责到什么程度", "出现例外时怎么提醒", "如果继续这样该怎么调整"],
      selected: 0,
      followUp: "你更愿意用哪种方式开口？",
      followUpOptions: ["约一个固定时间聊", "先从一件具体小事说起", "先写下来再面对面说"],
      followUpSelected: 1,
    },
    plan: {
      intro: "好，不从“你总是不收拾”开始。我们只准备一次 10 分钟谈话，围绕事实、影响和可执行的请求。",
      projectName: "公共区域沟通",
      objective: "把模糊的不满变成一次不指责、可执行的室友沟通。",
      milestone: "完成一次谈话，并确认一条双方都能做到的分工",
      boundary: "这次先不谈过去所有旧账，也不要求一次解决所有摩擦",
      tasks: [
        { title: "写下最近三次具体事实，不写评价词", time: "10 分钟", note: "例如哪天、哪些东西、放了多久" },
        { title: "准备一句影响和一句具体请求", time: "10 分钟", note: "先说影响，再提出一周内能执行的做法" },
        { title: "约 10 分钟聊完，只确认一条分工", time: "15 分钟", note: "结尾复述一次双方同意的内容" },
      ],
      nextStep: "写下最近三次具体事实",
    },
    review: {
      progress: "今天真正推进的是把“感觉很烦”整理成可沟通的事实，卡在担心一开口就像指责。",
      insight: "谈话的目标不是赢，而是让一条新规则真正落地。",
      nextAction: "找一个双方都不赶时间的 10 分钟，只谈这一条规则。",
    },
  },
  {
    id: "creation",
    tab: "创作选择",
    idea: "我拍了很多城市夜晚的照片，也存了一堆电影和摄影参考，想整理成一个连续系列。但每次打开文件夹都只会继续收藏，最后没有选出任何主题。",
    clarify: {
      intro: "你缺的还不是更多参考，而是一个能帮你排除素材的判断标准。我们先把系列收成一个明确感受。",
      question: "你希望别人看到这组照片时，最先感受到什么？",
      options: ["城市的孤独感", "夜晚仍然有人生活", "霓虹背后的失真感"],
      selected: 1,
      followUp: "如果只保留一个限制，你更想用哪种？",
      followUpOptions: ["只拍同一时间段", "只保留有明显人影的照片", "只用一种色调和构图"],
      followUpSelected: 2,
    },
    plan: {
      intro: "好，先不整理全部素材。我们把系列收成一句主题和一个拍摄限制，用它筛出第一批 12 张。",
      projectName: "城市夜归人",
      objective: "从大量参考和照片中选出连续主题，做出第一组能放在一起看的 12 张照片。",
      milestone: "形成一组有统一情绪和构图限制的 12 张初选",
      boundary: "这次先不做完整展览，也不追求覆盖所有夜晚场景",
      tasks: [
        { title: "写一句系列主题，不超过 20 个字", time: "10 分钟", note: "先确定情绪，不先写摄影术语" },
        { title: "按一个限制筛出 12 张照片", time: "30 分钟", note: "不修图，只看是否符合同一个主题" },
        { title: "把 12 张排成一条顺序并写选择理由", time: "10 分钟", note: "找出第一张和最后一张的关系" },
      ],
      nextStep: "写一句系列主题，不超过 20 个字",
    },
    review: {
      progress: "今天真正推进的是从无止境收藏变成一句主题和一个筛选限制，卡在舍不得删掉部分好照片。",
      insight: "系列感不来自每张都最好，而来自它们能共同说明一件事。",
      nextAction: "只拍或补拍 3 张符合限制的新照片，再决定是否替换。",
    },
  },
  {
    id: "time",
    tab: "时间诊断",
    idea: "最近每天都像很忙，但晚上回想不出完成了什么。开会、回消息、处理零碎事情占满一天，真正想推进的事一直往后拖。",
    clarify: {
      intro: "先不急着立时间管理计划。我们缺的是一天到底被什么拿走的证据，而不是再给自己加一套规则。",
      question: "你最想先看清哪一部分？",
      options: ["注意力被谁打断", "时间花在哪些重复事情", "哪件事其实不该由我做"],
      selected: 1,
      followUp: "记录时你更能接受哪种方式？",
      followUpOptions: ["每小时打一个标签", "只记三个关键时间块", "下班前回忆一次"],
      followUpSelected: 0,
    },
    plan: {
      intro: "好，这次不做完整日程审计。只记录三天，每次用 10 秒打一个标签，先找出最稳定的时间漏洞。",
      projectName: "时间去向诊断",
      objective: "用三天低成本记录，找出一个反复出现的时间漏洞，再决定改什么。",
      milestone: "得到三天时间标签，并确认一个最值得处理的模式",
      boundary: "这次先不优化全部日程，也不要求每天精确记录到分钟",
      tasks: [
        { title: "设定 3 个最常出现的时间标签", time: "10 分钟", note: "例如开会、回消息、临时救火、被动等待" },
        { title: "今天遇到就从通知栏快速打标签", time: "5 分钟", note: "不补录、不解释，只记录事实" },
        { title: "睡前看一次分布，只圈一个异常点", time: "10 分钟", note: "找重复模式，不看单次波动" },
      ],
      nextStep: "设定 3 个最常出现的时间标签",
    },
    review: {
      progress: "今天真正推进的是开始留下时间证据，而不是继续凭感觉判断自己不够自律。",
      insight: "第一天不需要得出结论，只要让一个常被忽略的时间漏洞变得可见。",
      nextAction: "继续同一套标签，重点观察下午是否重复出现同一个漏洞。",
    },
  },
  {
    id: "event",
    tab: "复杂活动",
    idea: "我想组织一次 10 人左右的周末徒步，大家时间、体力和预算都不一样。群里聊了两周还没定下来，我有点怕最后变成只有我一个人在推进。",
    clarify: {
      intro: "这不是你一个人的执行力问题，而是决策点太分散。先分清哪些必须由你定，哪些可以由大家投票。",
      question: "现在最影响定下来的是什么？",
      options: ["路线难度和体力差异", "预算与交通方式", "具体日期总有人冲突"],
      selected: 1,
      followUp: "你希望自己承担到什么程度？",
      followUpOptions: ["我定框架，大家选选项", "我只收集信息，最后一起定", "我直接给一个默认方案"],
      followUpSelected: 0,
    },
    plan: {
      intro: "好，先把群聊收成一个默认方案。你负责框架，大家只在有限选项里做决定，避免无限讨论。",
      projectName: "周末徒步成行",
      objective: "用一套默认方案结束反复讨论，让活动先确定日期、预算和负责人。",
      milestone: "确定一版默认路线和预算，并锁定具体日期",
      boundary: "这次先不照顾所有人的偏好，也不做备选路线大全",
      tasks: [
        { title: "发一个日期投票，只保留两个选项", time: "10 分钟", note: "默认票数最高的那天成行" },
        { title: "给出人均预算上限和交通方案", time: "15 分钟", note: "先联系两个人确认可接受范围" },
        { title: "列出三项必须确认的信息和负责人", time: "10 分钟", note: "路线、集合时间、应急联系人" },
      ],
      nextStep: "发一个日期投票，只保留两个选项",
    },
    review: {
      progress: "今天真正推进的是把群聊里的分散意见变成一个有截止时间的默认方案，卡在担心少数人不满意。",
      insight: "活动能成行的关键不是所有人都满意，而是决策规则足够清楚。",
      nextAction: "根据投票锁定日期，再发预算上限和默认交通方案。",
    },
  },
];

const STEPS = ["先聊清楚", "拆出计划", "推进与复盘"];
const STEP_MS = 4600;

export function LandingDemo() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const scenario = DEMO_SCENARIOS[scenarioIndex];

  useEffect(() => {
    setScenarioIndex(Math.floor(Math.random() * DEMO_SCENARIOS.length));
    setStage(0);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(
      () => setStage((current) => (current + 1) % STEPS.length),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [playing, scenarioIndex]);

  function refreshDemo() {
    let next = Math.floor(Math.random() * DEMO_SCENARIOS.length);
    if (DEMO_SCENARIOS.length > 1 && next === scenarioIndex) {
      next = (next + 1) % DEMO_SCENARIOS.length;
    }
    setScenarioIndex(next);
    setStage(0);
    setPlaying(true);
  }

  return (
    <div
      className="mt-6"
      onClick={() => {
        if (!playing) setPlaying(true);
      }}
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        {STEPS.map((step, index) => {
          const active = index === stage;
          const done = index < stage;
          return (
            <button
              key={step}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setStage(index);
                setPlaying(false);
              }}
              className={cx(
                "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                active
                  ? "bg-accent-soft text-accent-strong"
                  : done
                    ? "bg-surface-muted text-ink-secondary"
                    : "bg-surface-muted text-ink-muted",
              )}
            >
              {done ? <Check className="size-3.5" /> : <span>{index + 1}.</span>}
              <span className="truncate">{step}</span>
            </button>
          );
        })}
      </div>

      <div className="zouzou-panel relative min-h-[300px] rounded-xl bg-surface p-4 pb-16 sm:p-5 sm:pb-16">
        {stage === 0 ? (
          <div
            key={`clarify-${scenario.id}`}
            className="animate-[zouzou-fade-in_400ms_ease-out]"
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <div className="max-w-[78%] rounded-xl rounded-tr-sm bg-surface-muted px-3 py-2.5 text-sm leading-6 text-ink">
                  {splitDemoInput(scenario.idea).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-1 flex size-6 shrink-0 items-center justify-center text-accent">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm leading-6 text-ink">
                    {scenario.clarify.intro}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink">
                    {scenario.clarify.question}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-8">
                {scenario.clarify.options.map((option) => (
                  <span
                    key={option}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/70 bg-transparent px-3 py-2 text-sm font-medium text-ink-secondary"
                  >
                    {option}
                  </span>
                ))}
              </div>
              <div className="flex justify-end">
                <div className="max-w-[72%] rounded-xl rounded-tr-sm bg-surface-muted px-3 py-2.5 text-sm leading-6 text-ink">
                  {scenario.clarify.options[scenario.clarify.selected]}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-1 flex size-6 shrink-0 items-center justify-center text-accent">
                  <Sparkles className="size-3.5" />
                </span>
                <p className="min-w-0 flex-1 pt-0.5 text-sm leading-6 text-ink">
                  {scenario.clarify.followUp}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pl-8">
                {scenario.clarify.followUpOptions.map((option) => (
                  <span
                    key={option}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/70 bg-transparent px-3 py-2 text-sm font-medium text-ink-secondary"
                  >
                    {option}
                  </span>
                ))}
              </div>
              <div className="flex justify-end">
                <div className="max-w-[72%] rounded-xl rounded-tr-sm bg-surface-muted px-3 py-2.5 text-sm leading-6 text-ink">
                  {scenario.clarify.followUpOptions[scenario.clarify.followUpSelected]}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {stage === 1 ? (
          <div key={`plan-${scenario.id}`} className="animate-[zouzou-fade-in_400ms_ease-out]">
            <div className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
              <Sparkles className="size-3.5 text-accent" />
              推进伙伴
            </div>
            <p className="mt-2 text-sm leading-6 text-ink">{scenario.plan.intro}</p>
            <p className="mt-4 text-sm font-semibold text-ink">{scenario.plan.projectName}</p>
            <p className="mt-1 text-xs leading-5 text-ink-secondary">{scenario.plan.objective}</p>
            <div className="mt-4 space-y-2">
              {scenario.plan.tasks.map((task, index) => (
                <div key={task.title} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <Check className="size-4 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {index + 1}. {task.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{task.note}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted">{task.time}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-xs leading-5 text-success">
              <Target className="mt-0.5 size-4 shrink-0" />
              今天可以做：{scenario.plan.nextStep}
            </p>
          </div>
        ) : null}

        {stage === 2 ? (
          <div key={`loop-${scenario.id}`} className="animate-[zouzou-fade-in_400ms_ease-out]">
            <div className="flex items-center justify-between text-xs font-medium text-ink-secondary">
              <span className="inline-flex items-center gap-1.5">
                <ListTodo className="size-3.5 text-accent" />
                今日推进
              </span>
              <span>1/3 完成</span>
            </div>
            <div className="mt-2 space-y-2">
              {scenario.plan.tasks.map((task, index) => {
                const status = index === 0 ? "done" : index === 1 ? "doing" : "todo";
                return (
                  <div key={task.title} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      {status === "done" ? (
                        <Check className="size-4 shrink-0 text-success" />
                      ) : status === "doing" ? (
                        <span className="size-2 shrink-0 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-accent" />
                      ) : (
                        <span className="size-2 shrink-0 rounded-full border border-ink-muted" />
                      )}
                      <span className="truncate text-sm text-ink">{task.title}</span>
                    </div>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {status === "done" ? "已完成" : status === "doing" ? "进行中" : "待办"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-surface px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
                <NotebookPen className="size-3.5 text-accent" />
                今晚复盘
              </div>
              <p className="mt-1 text-sm leading-6 text-ink">{scenario.review.progress}</p>
              <p className="mt-2 border-l-2 border-accent/40 pl-2 text-xs leading-5 text-ink-secondary">
                判断：{scenario.review.insight}
              </p>
              <p className="mt-2 text-xs text-success">明天可以做：{scenario.review.nextAction}</p>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-accent-soft px-3 py-3 text-sm font-medium text-accent-strong">
              <Target className="size-4" />
              有想法，当然可以实现。
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={refreshDemo}
          aria-label="随机换一个演示"
          title="随机换一个演示"
          className="absolute bottom-2 right-2 z-10 inline-flex h-11 items-center gap-2 rounded-full border border-accent/20 bg-surface px-4 text-sm font-medium text-accent-strong shadow-pop transition-colors hover:bg-accent-soft sm:bottom-3 sm:right-3"
        >
          <RefreshCw className="size-4" />
          <span className="hidden sm:inline">换一个演示</span>
        </button>
      </div>
    </div>
  );
}
