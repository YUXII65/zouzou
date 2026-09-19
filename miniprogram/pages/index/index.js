const DEMO_SCENARIOS = require("./demo-data");

const STEP_MS = 4600;
const STEP_COUNT = 3;

function splitDemoInput(value) {
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

function decorateScenario(scenario) {
  return {
    ...scenario,
    ideaLines: splitDemoInput(scenario.idea),
    clarifySelectedLabel: scenario.clarify.options[scenario.clarify.selected],
    clarifyOptions: scenario.clarify.options.map((label, index) => ({
      label,
      selected: index === scenario.clarify.selected
    })),
    followUpOptions: scenario.clarify.followUpOptions.map((label, index) => ({
      label,
      selected: index === scenario.clarify.followUpSelected
    })),
    loopTasks: scenario.plan.tasks.map((task, index) => ({
      ...task,
      status: index === 0 ? "done" : index === 1 ? "doing" : "todo",
      statusLabel: index === 0 ? "已完成" : index === 1 ? "进行中" : "待办"
    }))
  };
}

Page({
  data: {
    outcomes: [
      {
        icon: "✦",
        title: "不用内耗复杂的思绪",
        body: "倒出想法，AI 自动归类到项目，生成可执行任务。"
      },
      {
        icon: "◉",
        title: "不用纠结今天做什么",
        body: "每天打开，先看到今天最该推进的 1-3 件事。"
      },
      {
        icon: "✎",
        title: "不用害怕半途而废",
        body: "每晚轻量复盘，AI 自动生成明天计划，形成持续闭环。"
      }
    ],
    steps: ["先聊清楚", "拆出计划", "推进与复盘"],
    activeStep: 0,
    playing: true,
    scenarioIndex: 0,
    demo: decorateScenario(DEMO_SCENARIOS[0]),
    comparisons: [
      { name: "ChatGPT", gap: "会帮你整理，但不会持续记住你的目标和复盘。" },
      { name: "Todoist", gap: "帮你管理任务，但不知道你为什么做。" },
      { name: "Notion", gap: "给你一堆模板，但不知道哪个适合你。" },
      { name: "WorkBuddy", gap: "替你执行任务，但不会帮你决定该做什么。" },
      { name: "走走", gap: "帮你把想法变成可持续推进的个人项目。" }
    ],
    audiences: [
      "学习者：备考、学英语、学技能，一直开始不了。",
      "创作者：自媒体、写作、作品集，想法多但输出少。",
      "自由职业者：项目杂、优先级乱，需要每天聚焦。",
      "知识工作者：会议和琐事多，需要把重要目标拉回日常。"
    ]
  },

  timerId: null,

  onLoad() {
    const scenarioIndex = Math.floor(Math.random() * DEMO_SCENARIOS.length);
    this.setData({
      scenarioIndex,
      demo: decorateScenario(DEMO_SCENARIOS[scenarioIndex]),
      activeStep: 0,
      playing: true
    });
    this.startAutoplay();
  },

  onShow() { if (this.data.playing) this.startAutoplay(); },
  onHide() { this.clearAutoplay(); },
  onUnload() { this.clearAutoplay(); },

  clearAutoplay() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },

  startAutoplay() {
    this.clearAutoplay();
    if (!this.data.playing) return;
    this.timerId = setInterval(() => {
      const next = (this.data.activeStep + 1) % STEP_COUNT;
      this.setData({ activeStep: next });
    }, STEP_MS);
  },

  onStepTap(event) {
    const index = Number(event.currentTarget.dataset.index) || 0;
    this.clearAutoplay();
    this.setData({ activeStep: index, playing: false });
  },

  onDemoTap() {
    if (this.data.playing) return;
    this.setData({ playing: true });
    this.startAutoplay();
  },

  refreshDemo() {
    let next = Math.floor(Math.random() * DEMO_SCENARIOS.length);
    if (DEMO_SCENARIOS.length > 1 && next === this.data.scenarioIndex) {
      next = (next + 1) % DEMO_SCENARIOS.length;
    }
    this.setData({
      scenarioIndex: next,
      demo: decorateScenario(DEMO_SCENARIOS[next]),
      activeStep: 0,
      playing: true
    });
    this.startAutoplay();
  },

  onLoginTap() {
    wx.navigateTo({ url: "/pages/login/login" });
  }
});