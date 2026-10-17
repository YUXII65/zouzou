const { sampleIdeasForDate, pickRandomSampleIdeas } = require("../../utils/sample-ideas");
const { canShowCaptureClarification, isUsableInboxPlan, normalizeTodayResult } = require("../../utils/today-result");
const { openTab, syncTabBar } = require("../../utils/tab-bar");
const { markDataChanged, shouldRefresh } = require("../../utils/data-refresh");

const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" }
];

const TODAY_CACHE_KEY = "next_step_mp_today_cache";
const TODAY_CACHE_TTL = 24 * 60 * 60 * 1000;

function readTodayCache() {
  const { getToken } = require("../../utils/api");
  const token = getToken();
  if (!token) return null;
  const cached = wx.getStorageSync(TODAY_CACHE_KEY);
  if (!cached || typeof cached !== "object") return null;
  if (cached.token !== token) return null;
  if (!cached.at || Date.now() - cached.at > TODAY_CACHE_TTL) return null;
  return cached.data || null;
}

function writeTodayCache(data) {
  const { getToken } = require("../../utils/api");
  const token = getToken();
  if (!token || !data) return;
  try {
    wx.setStorageSync(TODAY_CACHE_KEY, { token, at: Date.now(), data });
  } catch (error) {
    // 缓存写入失败不影响正常流程。
  }
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function fallbackTitle(title) {
  const headline = String(title || "").split(/[，,。；;！？!\n]/)[0].trim() || String(title || "");
  return headline.length > 18 ? `${headline.slice(0, 17).trim()}…` : headline;
}

function priorityIndex(priority) {
  const index = PRIORITY_OPTIONS.findIndex((item) => item.value === priority);
  return index >= 0 ? index : 1;
}

function normalizeDimensions(clarification) {
  if (!clarification) return [];
  const raw = Array.isArray(clarification.dimensions)
    ? clarification.dimensions
    : clarification.question && Array.isArray(clarification.options)
      ? [{ key: "direction", question: clarification.question, options: clarification.options }]
      : [];

  return raw.map((dimension, index) => ({
    key: dimension.key || `dimension_${index}`,
    question: dimension.question || "先定一个方向",
    multi: Boolean(dimension.multi),
    options: (Array.isArray(dimension.options) ? dimension.options : [])
      .filter((option) => typeof option === "string" && option.trim())
      .map((option) => ({ label: option.trim(), selected: false }))
  })).filter((dimension) => dimension.options.length > 0);
}

function buildClarifyTurns(clarification, content) {
  const turns = [];
  if (content) turns.push({ role: "user", text: content });
  const history = clarification && Array.isArray(clarification.history)
    ? clarification.history
    : [];
  if (history.length) {
    history.forEach((entry) => {
      const answered = Array.isArray(entry.answer) && entry.answer.length > 0;
      turns.push({
        role: "ai",
        text: entry.question || "",
        reflection: entry.reflection || "",
        options: answered ? [] : (Array.isArray(entry.options) ? entry.options : []),
        multi: Boolean(entry.multi),
        key: entry.key || ""
      });
      if (answered) turns.push({ role: "user", text: entry.answer.join("、") });
    });
    return turns;
  }
  const first = normalizeDimensions(clarification)[0];
  if (first) {
    turns.push({
      role: "ai",
      text: first.question,
      options: first.options.map((option) => option.label),
      multi: Boolean(first.multi),
      key: first.key
    });
  }
  return turns;
}

function currentClarifyQuestion(turns) {
  const last = turns.length ? turns[turns.length - 1] : null;
  return last && last.role === "ai" ? last : null;
}

const { getContentTop } = require("../../utils/layout");

Page({
  data: {
    theme: "light",
    contentTop: 92,
    userAvatar: "",
    userInitial: "走",
    content: "",
    samples: sampleIdeasForDate(3),
    priorityLabels: PRIORITY_OPTIONS.map((item) => item.label),
    pendingItems: [],
    tasks: [],
    plannedTasks: [],
    completedTodayTasks: [],
    submittingPlanId: "",
    submittingClarifyId: "",
    expandedTaskId: ""
  },

  onLoad() {
    this.setData({ contentTop: getContentTop() });
    this._todayCacheRestored = false;
    this._lastLoadAt = 0;
    this._loadingToday = null;
    this._onboardingChecked = false;
  },

  syncTheme() {
    const { getTheme } = require("../../utils/theme");
    const theme = getTheme();
    if (theme !== this.data.theme) this.setData({ theme });
    return theme;
  },

  syncUserHeader() {
    const { getCachedUser } = require("../../utils/api");
    const user = getCachedUser();
    const displayName = user ? (user.displayName || user.username || "走") : "走";
    const userAvatar = user && user.avatarUrl ? user.avatarUrl : "";
    const userInitial = displayName.slice(0, 1);
    if (userAvatar !== this.data.userAvatar || userInitial !== this.data.userInitial) {
      this.setData({ userAvatar, userInitial });
    }
  },

  onShow() {
    const theme = this.syncTheme();
    this.syncUserHeader();
    syncTabBar(this, "today", theme);

    if (!this._onboardingChecked) {
      this._onboardingChecked = true;
      this.ensureOnboarding();
    }

    if (!shouldRefresh("today", this._lastLoadAt)) return;
    this.restoreTodayCache();
    this.loadToday();
  },

  ensureOnboarding() {
    const { getToken, getOnboarding } = require("../../utils/api");
    if (!getToken()) return;
    getOnboarding()
      .then((state) => {
        if (state.isFirstRun && state.tourStep !== "done") {
          wx.reLaunch({ url: "/pages/onboarding/onboarding" });
        }
      })
      .catch(() => {});
  },

  restoreTodayCache() {
    if (this._todayCacheRestored) return;
    this._todayCacheRestored = true;
    const cached = readTodayCache();
    if (cached) {
      this.applyTodayResult(cached);
      return;
    }
    // 本地无缓存时，用微信「数据预拉取」的缓存兜底，让首屏更快出内容。
    const { applyPrefetchedToday } = require("../../utils/api");
    if (typeof applyPrefetchedToday === "function") {
      applyPrefetchedToday((data) => {
        if (data) this.applyTodayResult(data);
      });
    }
  },

  applyTodayResult(result) {
    const normalized = normalizeTodayResult(result);
    this.setData({
      pendingItems: normalized.pendingInbox.map((item) => {
        const plan = parseJson(item.aiPlanJson);
        const clarification = parseJson(item.aiSuggestionJson);
        const rawDimensions = normalizeDimensions(clarification);
        const clarifyStatus = clarification && clarification.status
          ? clarification.status
          : rawDimensions.length
            ? "asking"
            : "done";
        const dimensions = clarifyStatus === "done" ? [] : rawDimensions;
        const isAnswer = Boolean(
          plan && (plan.action === "answer" || plan.responseMode === "answer")
        );
        const hasPlan = Boolean(
          clarifyStatus === "done" &&
            plan &&
            plan.action !== "ignore" &&
            !isAnswer &&
            isUsableInboxPlan(plan)
        );
        const actionLabels = {
          create_project: "新建项目",
          existing_project: "归入项目",
          single_task: "创建任务",
          ignore: "建议忽略"
        };
        const action = isAnswer
          ? "直接回答"
          : hasPlan
            ? (actionLabels[plan.action] || "已整理")
            : dimensions.length
              ? "需要补充"
              : clarifyStatus === "done"
                ? "信息够了"
                : "正在梳理...";

        const turns = buildClarifyTurns(clarification, item.content);
        const question = clarifyStatus === "done" ? null : currentClarifyQuestion(turns);
        const askingOptions = question && Array.isArray(question.options) ? question.options : [];
        return {
          id: item.id,
          content: item.content,
          action,
          reason: plan && plan.reason ? plan.reason : "",
          isAnswer,
          planReady: hasPlan,
          directAnswer: isAnswer
            ? (plan.directAnswer || (plan.userCard && plan.userCard.how) || (plan.userCard && plan.userCard.understanding) || "")
            : "",
          dimensions,
          clarifyStatus,
          clarifyMode: clarification && clarification.mode ? clarification.mode : "",
          turns,
          options: askingOptions.map((label) => ({ label, selected: false })),
          multi: Boolean(question && question.multi),
          questionKey: question && question.key ? question.key : "",
          typed: "",
          directInput: false,
          supplementPlaceholder: clarification && clarification.supplementPlaceholder
            ? clarification.supplementPlaceholder
            : "如果这些选项都不准确，可以补充两句。"
        };
      }),
      ...(() => {
        const decorateTask = (task) => {
          const isDone = task.status === "done";
          const status = isDone ? "done" : task.status === "in_progress" ? "in_progress" : "todo";
          return {
            ...task,
            projectName: task.projectName || "未关联项目",
            dueDateText: task.dueDate ? String(task.dueDate).slice(0, 10) : "",
            displayTitle: task.shortTitle && task.shortTitle.trim() ? task.shortTitle.trim() : fallbackTitle(task.title),
            priorityLabel: (PRIORITY_OPTIONS.find((item) => item.value === task.priority) || PRIORITY_OPTIONS[1]).label,
            stickyNotes: Array.isArray(task.stickyNotes) ? task.stickyNotes.slice(0, 10) : [],
            canChangeStatus: !isDone,
            statusClass: status,
            statusIcon: isDone ? "✓" : task.status === "in_progress" ? "▶" : "○",
            actionLabel: isDone ? "完成" : task.status === "todo" ? "待办" : task.status === "in_progress" ? "进行" : "完成",
            nextStatus: isDone ? "" : task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : ""
          };
        };
        const plannedTasks = normalized.plannedTasks.map(decorateTask);
        const completedTodayTasks = normalized.completedTodayTasks.map(decorateTask);
        return {
          plannedTasks,
          completedTodayTasks,
          tasks: [...plannedTasks, ...completedTodayTasks],
        };
      })()
    });
  },

  loadToday() {
    const { getToken, getToday } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return Promise.resolve();
    }
    if (this._loadingToday) return this._loadingToday;

    this._loadingToday = getToday()
      .then((result) => {
        this.applyTodayResult(result);
        this._lastLoadAt = Date.now();
        writeTodayCache(result);
        this.maybeGenerateFocus(result);
      })
      .catch((error) => {
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "今日数据没加载出来", icon: "none" });
      })
      .then(() => {
        this._loadingToday = null;
      });
    return this._loadingToday;
  },

  // 当天还没有 AI 推荐时补算一次；每天只试一次，失败也不打断页面。
  maybeGenerateFocus(result) {
    const focus = result && Array.isArray(result.focusSuggestions)
      ? result.focusSuggestions
      : [];
    if (focus.length) return;
    const dateKey = (result && result.date) || "";
    if (!dateKey) return;
    const guardKey = "next_step_today_focus_attempt";
    try {
      if (wx.getStorageSync(guardKey) === dateKey) return;
      wx.setStorageSync(guardKey, dateKey);
    } catch (error) {
      // 存储不可用时仍然尝试一次。
    }
    const { refreshTodayFocus } = require("../../utils/api");
    refreshTodayFocus()
      .then(() => this.loadToday())
      .catch(() => {});
  },

  finishResolvedPlan(itemId) {
    const { confirmPlan } = require("../../utils/api");
    return confirmPlan({ itemId }).then((result) => result);
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value });
  },

  onSampleTap(event) {
    this.setData({ content: event.currentTarget.dataset.sample || "" });
  },

  onRefreshSamples() {
    this.setData({ samples: pickRandomSampleIdeas(3) });
  },

  onSubmit() {
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: "先写一句想法", icon: "none" });
      return;
    }

    const { clarifyIdea } = require("../../utils/api");
    wx.showLoading({ title: "正在读你的原话..." });
    clarifyIdea(content)
      .then((response) => {
        if (!canShowCaptureClarification(response)) {
          throw new Error("missing_clarification");
        }
        this.setData({ content: "" });
        wx.hideLoading();
        wx.showToast({ title: "先回答一个问题", icon: "none" });
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "没送出去，再试一次", icon: "none" });
      });
  },

  onClarifyOptionTap(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const optionIndex = Number(event.currentTarget.dataset.optionIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item || !item.options || !item.options[optionIndex]) return;
    if (this.data.submittingClarifyId) return;

    if (item.multi) {
      const options = item.options.map((option, index) =>
        index === optionIndex ? { ...option, selected: !option.selected } : option
      );
      this.setData({ [`pendingItems[${itemIndex}].options`]: options });
      return;
    }
    this.commitClarifyAnswer(itemIndex, [item.options[optionIndex].label]);
  },

  onClarifyMultiConfirm(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item) return;
    const answer = (item.options || [])
      .filter((option) => option.selected)
      .map((option) => option.label);
    if (!answer.length) {
      wx.showToast({ title: "先选一项", icon: "none" });
      return;
    }
    this.commitClarifyAnswer(itemIndex, answer);
  },

  onClarifyDirectToggle(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item) return;
    this.setData({ [`pendingItems[${itemIndex}].directInput`]: !item.directInput });
  },

  onClarifyTypedInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    if (Number.isNaN(itemIndex)) return;
    this.setData({ [`pendingItems[${itemIndex}].typed`]: event.detail.value });
  },

  onClarifyDirectSend(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item) return;
    const typed = String(item.typed || "").trim();
    if (!typed) {
      wx.showToast({ title: "先说一句", icon: "none" });
      return;
    }
    this.commitClarifyAnswer(itemIndex, [typed]);
  },

  commitClarifyAnswer(itemIndex, answer) {
    const item = this.data.pendingItems[itemIndex];
    if (!item || this.data.submittingClarifyId) return;
    const { advanceClarify, planInbox } = require("../../utils/api");
    this.setData({ submittingClarifyId: item.id });
    wx.showLoading({ title: "正在想下一个问题..." });
    const next = item.clarifyMode === "socratic"
      ? advanceClarify(item.id, answer, item.questionKey)
      : Promise.resolve(null);
    next
      .then((response) => {
        if (item.clarifyMode !== "socratic") {
          return planInbox({
            itemId: item.id,
            option: answer.join("、"),
            dimensionChoices: [answer.join("、")],
          });
        }
        const result = response && response.result ? response.result : response;
        const clarification = result && result.clarification ? result.clarification : result;
        const turns = buildClarifyTurns(clarification, item.content);
        if (clarification && clarification.status !== "done") {
          const question = currentClarifyQuestion(turns);
          const askingOptions = question && Array.isArray(question.options) ? question.options : [];
          this.setData({
            [`pendingItems[${itemIndex}].turns`]: turns,
            [`pendingItems[${itemIndex}].options`]: askingOptions.map((label) => ({ label, selected: false })),
            [`pendingItems[${itemIndex}].multi`]: Boolean(question && question.multi),
            [`pendingItems[${itemIndex}].questionKey`]: question && question.key ? question.key : "",
            [`pendingItems[${itemIndex}].typed`]: "",
            [`pendingItems[${itemIndex}].directInput`]: false,
          });
          wx.hideLoading();
          this.setData({ submittingClarifyId: "" });
          return null;
        }
        // 先落完成态，再请求方案。即使方案请求超时，界面也不会退回成一个悬空的旧问题。
        this.setData({
          [`pendingItems[${itemIndex}].clarifyStatus`]: "done",
          [`pendingItems[${itemIndex}].turns`]: turns,
          [`pendingItems[${itemIndex}].options`]: [],
          [`pendingItems[${itemIndex}].multi`]: false,
          [`pendingItems[${itemIndex}].questionKey`]: "",
          [`pendingItems[${itemIndex}].typed`]: "",
          [`pendingItems[${itemIndex}].directInput`]: false,
          [`pendingItems[${itemIndex}].action`]: "信息够了",
        });
        wx.showLoading({ title: "正在整理下一步..." });
        return planInbox({
          itemId: item.id,
          option: answer.join("、"),
          dimensionChoices: [answer.join("、")],
        });
      })
      .then((planResult) => {
        if (!planResult) return null;
        if (!isUsableInboxPlan(planResult)) {
          wx.hideLoading();
          this.setData({ submittingClarifyId: "" });
          wx.showToast({ title: "这次没整理完整，点重试", icon: "none" });
          this.loadToday();
          return null;
        }
        return this.finishResolvedPlan(item.id).then(() => {
          markDataChanged(["today", "workspace", "profile"]);
          wx.hideLoading();
          this.setData({ submittingClarifyId: "" });
          wx.showToast({ title: "已放进文件", icon: "success" });
          this.loadToday();
        });
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ submittingClarifyId: "" });
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "这次没整理出来，再试一次", icon: "none" });
      });
  },

  onGeneratePlan(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item || this.data.submittingClarifyId) return;
    const { planInbox } = require("../../utils/api");
    this.setData({ submittingClarifyId: item.id });
    wx.showLoading({ title: "正在整理下一步..." });
    planInbox({ itemId: item.id })
      .then((planResult) => {
        if (!isUsableInboxPlan(planResult)) {
          throw new Error("agent_failed");
        }
        return this.finishResolvedPlan(item.id).then(() => {
          markDataChanged(["today", "workspace", "profile"]);
          wx.hideLoading();
          this.setData({ submittingClarifyId: "" });
          wx.showToast({ title: "已放进文件", icon: "success" });
          this.loadToday();
        });
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ submittingClarifyId: "" });
        if (error && error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "这次没整理完整，点重试", icon: "none" });
      });
  },

  onConfirmPlan(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item || this.data.submittingPlanId) return;

    this.setData({ submittingPlanId: item.id });
    wx.showLoading({ title: "正在整理..." });
    this.finishResolvedPlan(item.id, null)
      .then((result) => {
        markDataChanged(["today", "workspace", "profile"]);
        wx.hideLoading();
        this.setData({ submittingPlanId: "" });
        wx.showToast({
          title: result && result.directAnswer ? "已直接回答" : "已放进文件",
          icon: result && result.directAnswer ? "none" : "success"
        });
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ submittingPlanId: "" });
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "这次没整理出来，再试一次", icon: "none" });
      });
  },


  onTaskStatusTap(event) {
    const taskId = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    if (!taskId || !status) return;

    const { setTaskStatus } = require("../../utils/api");
    wx.showLoading({ title: "正在同步..." });
    setTaskStatus(taskId, status)
      .then(() => {
        markDataChanged(["today", "workspace", "profile"]);
        wx.hideLoading();
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "状态没更新成功", icon: "none" });
      });
  },

  onTaskExpandTap(event) {
    const taskId = event.currentTarget.dataset.id;
    if (!taskId) return;
    this.setData({ expandedTaskId: this.data.expandedTaskId === taskId ? "" : taskId });
  },

  onStickyChange(event) {
    const taskId = event.currentTarget.dataset.id;
    const stickyNotes = Array.isArray(event.detail.notes) ? event.detail.notes : [];
    if (!taskId) return;
    const patch = (tasks) => (tasks || []).map((task) =>
      task.id === taskId ? { ...task, stickyNotes } : task
    );
    markDataChanged(["today", "workspace"]);
    this.setData({
      tasks: patch(this.data.tasks),
      plannedTasks: patch(this.data.plannedTasks),
      completedTodayTasks: patch(this.data.completedTodayTasks),
    });
  },


  onProfileTap() { openTab("profile"); },


});
