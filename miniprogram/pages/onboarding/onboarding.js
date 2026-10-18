const { openTab } = require("../../utils/tab-bar");
const { getContentTop } = require("../../utils/layout");
const { sampleIdeasForDate, pickRandomSampleIdeas } = require("../../utils/sample-ideas");

const STEP_MS = 1400;

Page({
  data: {
    contentTop: 115,
    stepIndex: 0,
    steps: [
      { label: "写想法" },
      { label: "谈感受" },
      { label: "建项目" },
      { label: "定今日" }
    ],
    idea: "",
    samples: sampleIdeasForDate(3),
    generating: false,
    generatingText: "正在读你的话",
    clarification: null,
    turns: [],
    options: [],
    multi: false,
    selected: [],
    answers: [],
    dimensionIndex: 0,
    directInput: false,
    typed: "",
    clarifyDone: false,
    aiFallback: false,
    projectName: "",
    objective: "",
    milestone: "",
    taskTitle: "",
    taskShortTitle: "",
    taskExecutionMode: "quick",
    taskDoneWhen: "",
    taskMethodHint: "",
    taskRecommendation: "",
    taskExecutionSteps: "",
    taskFallback: "",
    taskMaxTurns: "1",
    taskToolPolicy: "none",
    completing: false
  },

  onLoad() {
    this.setData({ contentTop: getContentTop() });
    this.loadState();
  },

  onUnload() {
    this.stopGenerating();
  },

  loadState() {
    const { getToken, getOnboarding } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    getOnboarding()
      .then((state) => {
        if (!state.isFirstRun || state.tourStep === "done") {
          openTab("today");
        }
      })
      .catch(() => {});
  },

  onIdeaInput(event) {
    this.setData({ idea: event.detail.value });
  },

  onSampleTap(event) {
    this.setData({ idea: event.currentTarget.dataset.content || "" });
  },

  onRefreshSamples() {
    this.setData({ samples: pickRandomSampleIdeas(3) });
  },

  startGenerating(messages) {
    this.stopGenerating();
    let index = 0;
    this.setData({ generatingText: messages[0] });
    this._generatingTimer = setInterval(() => {
      index = (index + 1) % messages.length;
      this.setData({ generatingText: messages[index] });
    }, STEP_MS);
  },

  stopGenerating() {
    if (this._generatingTimer) {
      clearInterval(this._generatingTimer);
      this._generatingTimer = null;
    }
  },

  startClarify() {
    const idea = String(this.data.idea || "").trim();
    if (!idea || this.data.generating) return;
    const { clarifyOnboardingIdea } = require("../../utils/api");
    this.setData({ idea, generating: true });
    this.startGenerating(["正在读你的话", "正在理解你"]);
    clarifyOnboardingIdea(idea)
      .then((clarification) => {
        const dimensions = clarification && Array.isArray(clarification.dimensions)
          ? clarification.dimensions
          : [];
        this.stopGenerating();
        this.setData({
          generating: false,
          clarification,
          answers: [],
          dimensionIndex: 0
        });
        if (!dimensions.length) {
          this.finishPlan([]);
          return;
        }
        this.setData({ stepIndex: 1 });
        this.renderDimension(0, [{ role: "user", text: idea }]);
      })
      .catch(() => {
        this.stopGenerating();
        this.setData({ generating: false });
        this.finishPlan([]);
      });
  },

  renderDimension(index, turns) {
    const clarification = this.data.clarification || {};
    const dimensions = Array.isArray(clarification.dimensions) ? clarification.dimensions : [];
    const dimension = dimensions[index];
    if (!dimension) {
      this.finishPlan(this.data.answers);
      return;
    }
    const options = (Array.isArray(dimension.options) ? dimension.options : [])
      .filter((label) => typeof label === "string" && label.trim())
      .map((label) => ({ label: label.trim(), selected: false }));
    this.setData({
      turns: turns.concat([{ role: "ai", text: dimension.question || "先定一个方向" }]),
      options,
      multi: Boolean(dimension.multi),
      selected: [],
      dimensionIndex: index,
      directInput: false,
      typed: "",
      clarifyDone: false
    });
  },

  commitAnswer(answer) {
    if (!Array.isArray(answer) || !answer.length || this.data.clarifyDone) return;
    const turns = this.data.turns.concat([{ role: "user", text: answer.join("、") }]);
    const answers = this.data.answers.concat([answer]);
    const dimensions = this.data.clarification && Array.isArray(this.data.clarification.dimensions)
      ? this.data.clarification.dimensions
      : [];
    const nextIndex = this.data.dimensionIndex + 1;
    this.setData({ turns, answers, options: [], selected: [], multi: false, directInput: false, typed: "" });
    if (nextIndex < dimensions.length) {
      this.renderDimension(nextIndex, turns);
      return;
    }
    this.setData({
      turns: turns.concat([{ role: "ai", text: "信息够了，我按刚才确认的边界往下整理。" }]),
      clarifyDone: true
    });
  },

  onOptionTap(event) {
    const label = event.currentTarget.dataset.label;
    if (!label || this.data.clarifyDone) return;
    if (!this.data.multi) {
      this.commitAnswer([label]);
      return;
    }
    const options = this.data.options.map((option) => option.label === label
      ? Object.assign({}, option, { selected: !option.selected })
      : option);
    const selected = options.filter((option) => option.selected).map((option) => option.label);
    this.setData({ options, selected });
  },

  onMultiConfirm() {
    this.commitAnswer(this.data.selected);
  },

  onToggleDirectInput() {
    this.setData({ directInput: !this.data.directInput, typed: "" });
  },

  onTypedInput(event) {
    this.setData({ typed: event.detail.value });
  },

  onDirectSend() {
    const typed = String(this.data.typed || "").trim();
    if (!typed) return;
    this.commitAnswer([typed]);
  },

  submitClarify() {
    if (!this.data.clarifyDone || this.data.generating) return;
    const answers = [];
    (this.data.answers || []).forEach((answer) => answers.push.apply(answers, answer));
    this.finishPlan(answers);
  },

  finishPlan(choices) {
    const { planOnboardingIdea } = require("../../utils/api");
    const idea = String(this.data.idea || "").trim();
    const prompt = choices && choices.length
      ? idea + "\n方向倾向：" + choices.join("、")
      : idea;
    this.setData({ generating: true });
    this.startGenerating(["正在收成能开始的第一步…", "正在整理项目…", "快整理好了…"]);
    planOnboardingIdea(prompt)
      .then((plan) => {
        this.stopGenerating();
        this.applyPlan(plan || {}, false);
      })
      .catch(() => {
        this.stopGenerating();
        this.applyPlan(this.fallbackPlan(), true);
      });
  },

  fallbackPlan() {
    const idea = String(this.data.idea || "").trim();
    return {
      projectName: idea.slice(0, 12) || "个人推进项目",
      objective: "把“" + idea + "”推进到真正做起来。",
      milestone: "做出第一个可见结果",
      taskTitle: "把「" + idea + "」做出第一个可见结果",
      taskShortTitle: "做出第一个可见结果",
      taskExecutionMode: "quick",
      taskDoneWhen: "出现一个能直接看到的结果",
      taskMethodHint: "直接动手做最小但真实的一部分，做出一个能看见的结果，再判断下一步。",
      taskRecommendation: "直接动手做最小但真实的一部分，做出一个能看见的结果，再判断下一步。",
      taskExecutionSteps: ["写下今天能开始的那个具体动作"],
      taskFallback: "",
      taskMaxTurns: 1,
      taskToolPolicy: "none"
    };
  },

  applyPlan(plan, fallback) {
    const steps = Array.isArray(plan.taskExecutionSteps)
      ? plan.taskExecutionSteps
      : [plan.taskExecutionSteps || ""].filter(Boolean);
    this.setData({
      generating: false,
      stepIndex: 2,
      aiFallback: Boolean(fallback || plan.usedFallback),
      projectName: plan.projectName || "",
      objective: plan.objective || "",
      milestone: plan.milestone || "",
      taskTitle: plan.taskTitle || "",
      taskShortTitle: plan.taskShortTitle || "",
      taskExecutionMode: plan.taskExecutionMode || "quick",
      taskDoneWhen: plan.taskDoneWhen || "",
      taskMethodHint: plan.taskMethodHint || "",
      taskRecommendation: plan.taskRecommendation || plan.taskMethodHint || "",
      taskExecutionSteps: steps.join("\n"),
      taskFallback: plan.taskFallback || "",
      taskMaxTurns: String(plan.taskMaxTurns || 1),
      taskToolPolicy: plan.taskToolPolicy || "none"
    });
  },

  onProjectNameInput(event) { this.setData({ projectName: event.detail.value }); },
  onObjectiveInput(event) { this.setData({ objective: event.detail.value }); },
  onMilestoneInput(event) { this.setData({ milestone: event.detail.value }); },
  onTaskTitleInput(event) { this.setData({ taskTitle: event.detail.value }); },

  goTaskStep() {
    if (!String(this.data.projectName || "").trim() || !String(this.data.objective || "").trim()) return;
    this.setData({ stepIndex: 3 });
  },

  onComplete() {
    if (this.data.completing) return;
    const { completeOnboarding } = require("../../utils/api");
    const taskTitle = String(this.data.taskTitle || "").trim();
    if (!taskTitle) return;
    this.setData({ completing: true });
    completeOnboarding({
      projectName: this.data.projectName,
      objective: this.data.objective,
      milestone: this.data.milestone,
      taskTitle,
      taskShortTitle: this.data.taskShortTitle,
      sourceIdea: this.data.idea,
      taskExecutionMode: this.data.taskExecutionMode,
      taskDoneWhen: this.data.taskDoneWhen,
      taskMethodHint: this.data.taskMethodHint,
      taskMaxTurns: this.data.taskMaxTurns,
      taskToolPolicy: this.data.taskToolPolicy,
      taskRecommendation: this.data.taskRecommendation,
      taskExecutionSteps: this.data.taskExecutionSteps,
      taskFallback: this.data.taskFallback
    })
      .then(() => {
        this.setData({ completing: false });
        openTab("desk");
      })
      .catch(() => {
        this.setData({ completing: false });
        wx.showToast({ title: "没创建成功，再试一次", icon: "none" });
      });
  },

  onSkip() {
    const { skipOnboardingFlow } = require("../../utils/api");
    if (this.data.skipping) return;
    this.setData({ skipping: true });
    skipOnboardingFlow()
      .catch(() => {})
      .then(() => openTab("today"));
  }
});
