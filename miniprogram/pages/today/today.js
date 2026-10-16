const { sampleIdeasForDate, pickRandomSampleIdeas } = require("../../utils/sample-ideas");

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

Page({
  data: {
    userAvatar: "",
    userInitial: "走",
    content: "",
    samples: sampleIdeasForDate(3),
    priorityLabels: PRIORITY_OPTIONS.map((item) => item.label),
    pendingItems: [],
    directAnswers: [],
    tasks: [],
    submittingPlanId: "",
    submittingClarifyId: "",
    ignoringInboxId: "",
    expandedTaskId: ""
  },

  onLoad() {
    this._todayCacheRestored = false;
  },

  syncUserHeader() {
    const { getCachedUser } = require("../../utils/api");
    const user = getCachedUser();
    const displayName = user ? (user.displayName || user.username || "走") : "走";
    this.setData({
      userAvatar: user && user.avatarUrl ? user.avatarUrl : "",
      userInitial: displayName.slice(0, 1)
    });
  },
  onShow() {
    this.syncUserHeader();
    this.restoreTodayCache();
    this.loadToday();
    this.ensureOnboarding();
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
    this.setData({
      pendingItems: (result.pendingItems || []).map((item) => {
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
          plan &&
            plan.action !== "ignore" &&
            !isAnswer &&
            Array.isArray(plan.tasks) &&
            plan.tasks.length
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
          supplement: "",
          supplementPlaceholder: clarification && clarification.supplementPlaceholder
            ? clarification.supplementPlaceholder
            : "如果这些选项都不准确，可以补充两句。"
        };
      }),
      tasks: (result.tasks || []).map((task) => {
        const isDone = task.status === "done";
        return {
          ...task,
          displayTitle: task.shortTitle && task.shortTitle.trim() ? task.shortTitle.trim() : fallbackTitle(task.title),
          priorityLabel: (PRIORITY_OPTIONS.find((item) => item.value === task.priority) || PRIORITY_OPTIONS[1]).label,
          canChangeStatus: !isDone,
          actionLabel: isDone
            ? "已完成"
            : task.status === "todo"
              ? "下一步"
              : task.status === "in_progress"
                ? "完成"
                : "已完成",
          nextStatus: isDone
            ? ""
            : task.status === "todo"
              ? "in_progress"
              : task.status === "in_progress"
                ? "done"
                : ""
        };
      })
    });
  },

  loadToday() {
    const { getToken, getToday } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }

    getToday()
      .then((result) => {
        this.applyTodayResult(result);
        writeTodayCache(result);
      })
      .catch((error) => {
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "今日数据没加载出来", icon: "none" });
      });
  },

  finishResolvedPlan(itemId, planResult) {
    const { confirmPlan } = require("../../utils/api");
    const plan = planResult && planResult.plan ? planResult.plan : planResult;
    return confirmPlan({ itemId }).then((result) => {
      const answer =
        (result && result.directAnswer) ||
        (plan && plan.directAnswer) ||
        (plan && plan.userCard && plan.userCard.how) ||
        (plan && plan.userCard && plan.userCard.understanding) ||
        "";
      if (answer) {
        const current = this.data.directAnswers || [];
        if (!current.some((item) => item.id === itemId)) {
          this.setData({
            directAnswers: [...current, { id: itemId, content: answer }]
          });
        }
      }
      return result;
    });
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

    const { clarifyIdea, planInbox } = require("../../utils/api");
    wx.showLoading({ title: "正在读你的原话..." });
    clarifyIdea(content)
      .then((response) => {
        const result = response && response.result ? response.result : response;
        const clarification = result && result.clarification;
        const itemId = result && result.itemId;
        this.setData({ content: "" });
        const needsNoQuestion = Boolean(
          itemId &&
            (!clarification ||
              clarification.status === "done" ||
              !Array.isArray(clarification.dimensions) ||
              clarification.dimensions.length === 0)
        );
        if (!needsNoQuestion) {
          wx.hideLoading();
          wx.showToast({ title: "已收进收件箱", icon: "none" });
          this.loadToday();
          return null;
        }
        return planInbox({ itemId })
          .then((planResult) => this.finishResolvedPlan(itemId, planResult))
          .then((result) => {
            wx.hideLoading();
            wx.showToast({
              title: result && result.directAnswer ? "已直接回答" : "已放进文件",
              icon: result && result.directAnswer ? "none" : "success"
            });
            this.loadToday();
          });
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
    const dimensionIndex = Number(event.currentTarget.dataset.dimensionIndex);
    const optionIndex = Number(event.currentTarget.dataset.optionIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item || !item.dimensions[dimensionIndex]) return;

    const dimensions = item.dimensions.map((dimension, currentDimensionIndex) => {
      if (currentDimensionIndex !== dimensionIndex) return dimension;
      return {
        ...dimension,
        options: dimension.options.map((option, currentOptionIndex) => ({
          ...option,
          selected: dimension.multi
            ? currentOptionIndex === optionIndex
              ? !option.selected
              : option.selected
            : currentOptionIndex === optionIndex
        }))
      };
    });

    this.setData({ [`pendingItems[${itemIndex}].dimensions`]: dimensions });
  },

  onClarifySupplementInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    if (Number.isNaN(itemIndex)) return;
    this.setData({ [`pendingItems[${itemIndex}].supplement`]: event.detail.value });
  },

  onClarifySubmit(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item || this.data.submittingClarifyId) return;

    const selected = item.dimensions
      .flatMap((dimension) =>
        dimension.options
          .filter((option) => option.selected)
          .map((option) => option.label)
      )
      .filter(Boolean)
      .slice(0, 6);
    const dimensionChoices = item.dimensions.map((dimension) =>
      dimension.options
        .filter((option) => option.selected)
        .map((option) => option.label)
        .join("、")
    );
    const supplement = String(item.supplement || "").trim();
    const answer = selected.length ? selected : supplement ? [supplement] : [];
    if (!answer.length) {
      wx.showToast({ title: "选一个方向，或补充两句", icon: "none" });
      return;
    }
    const { advanceClarify, planInbox } = require("../../utils/api");
    this.setData({ submittingClarifyId: item.id });
    wx.showLoading({ title: "正在判断..." });
    const next = item.clarifyMode === "socratic"
      ? advanceClarify(item.id, answer)
      : Promise.resolve(null);
    next
      .then((response) => {
        if (item.clarifyMode !== "socratic") {
          return planInbox({
            itemId: item.id,
            option: dimensionChoices.find(Boolean) || answer.join("、"),
            dimensionChoices,
            supplement
          });
        }
        const result = response && response.result ? response.result : response;
        const clarification = result && result.clarification ? result.clarification : result;
        if (clarification && clarification.status !== "done") {
          return null;
        }
        return planInbox({
          itemId: item.id,
          option: answer.join("、"),
          dimensionChoices: [answer.join("、")],
          supplement
        });
      })
      .then((planResult) => {
        if (!planResult) {
          wx.hideLoading();
          this.setData({ submittingClarifyId: "" });
          wx.showToast({ title: "继续问一个关键问题", icon: "none" });
          this.loadToday();
          return null;
        }
        return this.finishResolvedPlan(item.id, planResult).then((confirmed) => {
          wx.hideLoading();
          this.setData({ submittingClarifyId: "" });
          wx.showToast({
            title: confirmed && confirmed.directAnswer ? "已直接回答" : "已放进文件",
            icon: confirmed && confirmed.directAnswer ? "none" : "success"
          });
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
    this.onConfirmPlan(event);
  },

  onConfirmPlan(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item || this.data.submittingPlanId) return;

    this.setData({ submittingPlanId: item.id });
    wx.showLoading({ title: "正在整理..." });
    this.finishResolvedPlan(item.id, null)
      .then((result) => {
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

  onIgnoreInbox(event) {
    const itemId = event.currentTarget.dataset.id;
    if (!itemId || this.data.ignoringInboxId) return;
    const { ignoreInbox } = require("../../utils/api");
    this.setData({ ignoringInboxId: itemId });
    wx.showLoading({ title: "正在忽略..." });
    ignoreInbox(itemId)
      .then(() => {
        wx.hideLoading();
        this.setData({ ignoringInboxId: "" });
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ ignoringInboxId: "" });
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "忽略失败，再试一次", icon: "none" });
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

  onTaskEditTap(event) {
    const taskId = event.currentTarget.dataset.id;
    if (!taskId) return;
    wx.navigateTo({ url: `/pages/task-edit/task-edit?id=${encodeURIComponent(taskId)}` });
  },

  onProfileTap() { wx.navigateTo({ url: "/pages/profile/profile" }); },


  onTabTap(event) {
    const key = event.currentTarget.dataset.key;
    const routes = {
      today: "/pages/today/today",
      desk: "/pages/workspace/workspace",
      review: "/pages/review/review"
    };
    if (key === "today" || !routes[key]) return;
    wx.reLaunch({ url: routes[key] });
  }
});
