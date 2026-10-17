const { openTab, syncTabBar } = require("../../utils/tab-bar");
const { markDataChanged, shouldRefresh } = require("../../utils/data-refresh");

const MODE_META = {
  normal: { label: "普通" },
  longterm: { label: "长期" },
  explore: { label: "探索" }
};
const MODE_ORDER = ["normal", "longterm", "explore"];
const PRIORITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急"
};

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return "";
  return (date.getMonth() + 1) + "月" + date.getDate() + "日";
}

function formatDateKey(value) {
  const date = parseDate(value);
  if (!date) return "";
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function fallbackTitle(title) {
  const headline = String(title || "").split(/[，,。；;！？!\n]/)[0].trim() || String(title || "");
  return headline.length > 18 ? headline.slice(0, 17).trim() + "…" : headline;
}

function normalizeMode(mode) {
  return MODE_META[mode] ? mode : "normal";
}

function decorateTask(task) {
  const dueDate = parseDate(task.dueDate);
  const today = formatDateKey(new Date());
  const scheduledDate = parseDate(task.scheduledDate);
  const focusDate = parseDate(task.focusDate);
  const status = task.status || "todo";
  const nextStatus = status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "";
  const statusClass = status === "done" ? "done" : status === "in_progress" ? "in_progress" : "todo";

  return {
    ...task,
    stickyNotes: Array.isArray(task.stickyNotes) ? task.stickyNotes.slice(0, 10) : [],
    displayTitle: task.shortTitle && task.shortTitle.trim() ? task.shortTitle.trim() : fallbackTitle(task.title),
    priorityLabel: PRIORITY_LABELS[task.priority] || "中",
    dueDateText: formatDate(dueDate),
    scheduledDateText: formatDate(scheduledDate),
    completedAtText: formatDate(task.completedAt),
    isOverdue: Boolean(dueDate && formatDateKey(dueDate) < today && status !== "done"),
    isScheduled: Boolean(scheduledDate && formatDateKey(scheduledDate) === today),
    isFocused: Boolean(focusDate && formatDateKey(focusDate) === today),
    canChangeStatus: status !== "done",
    statusClass,
    statusIcon: status === "done" ? "✓" : status === "in_progress" ? "▶" : "○",
    actionLabel: status === "todo" ? "待办" : status === "in_progress" ? "进行" : "完成",
    nextStatus
  };
}

/** 阶段总结取句尾结论，避免把一整段交付物直接铺出来（与网页 StagePreviewPanel 一致）。 */
function shortStageSummary(text, fallback, limit) {
  const source = String(text || "").trim();
  if (!source) return fallback;
  const clauses = source
    .split(/[，,。；;：:\n、]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = clauses.length > 1 ? clauses[clauses.length - 1] : clauses[0];
  const out = candidate || fallback;
  return out.length > limit ? out.slice(0, limit) + "…" : out;
}

function decorateStage(stage) {
  if (!stage) return null;
  const nextStage = stage.nextStage || null;
  const nextTasks = nextStage && Array.isArray(nextStage.tasks) ? nextStage.tasks : [];
  return {
    ...stage,
    summary: shortStageSummary(
      nextStage && nextStage.currentSummary
        ? nextStage.currentSummary
        : stage.deliverable,
      "正在整理当前阶段",
      18
    ),
    nextSummary: shortStageSummary(
      nextStage && nextStage.nextSummary
        ? nextStage.nextSummary
        : nextStage && nextStage.nextMilestone
          ? nextStage.nextMilestone
          : "",
      "正在整理下一阶段",
      18
    ),
    nextOrder: Math.min((Number(stage.order) || 1) + 1, 5),
    canAdvance: stage.status === "ready" && nextTasks.length > 0,
    missingNextStage: !nextStage
  };
}

function decorateProject(project) {
  const modeKey = normalizeMode(project.mode);
  const tasks = (project.tasks || []).map(decorateTask);
  const openTasks = tasks.filter((task) => task.status === "todo" || task.status === "in_progress");
  const doneTasks = tasks.filter((task) => task.status === "done").sort((a, b) => {
    const left = parseDate(a.completedAt);
    const right = parseDate(b.completedAt);
    return (right ? right.getTime() : 0) - (left ? left.getTime() : 0);
  });
  const dueTimes = openTasks.map((task) => parseDate(task.dueDate)).filter(Boolean);
  const nextDue = dueTimes.length ? new Date(Math.min(...dueTimes.map((date) => date.getTime()))) : null;
  const todayStart = new Date(formatDateKey(new Date()) + "T00:00:00");
  const daysLeft = nextDue ? Math.max(0, Math.ceil((nextDue.getTime() - todayStart.getTime()) / 86400000)) : null;

  return {
    ...project,
    id: project.id,
    modeKey,
    modeLabel: MODE_META[modeKey].label,
    openTasks,
    doneTasks,
    openCount: openTasks.length,
    doneCount: doneTasks.length,
    daysLeft,
    allDone: openTasks.length === 0 && doneTasks.length > 0,
    stage: decorateStage(project.stage),
    reviews: Array.isArray(project.reviews)
      ? project.reviews.map((review) => ({
          id: review.id,
          dateText: formatDate(review.reviewDate),
          dateValue: formatDateKey(review.reviewDate),
        }))
      : [],
    tracks: Array.isArray(project.tracks) ? project.tracks : []
  };
}

function decorateUnassociated(tasks) {
  const decorated = (tasks || []).map(decorateTask);
  const openTasks = decorated.filter((task) => task.status === "todo" || task.status === "in_progress");
  const doneTasks = decorated.filter((task) => task.status === "done");
  if (!decorated.length) return null;
  return {
    id: "__unassigned__",
    name: "散落任务",
    modeKey: "unassociated",
    modeLabel: "",
    objective: "",
    currentMilestone: "",
    openTasks,
    doneTasks,
    openCount: openTasks.length,
    doneCount: doneTasks.length,
    allDone: openTasks.length === 0 && doneTasks.length > 0,
    stage: null,
    tracks: []
  };
}

const { getContentTop } = require("../../utils/layout");

Page({
  data: {
    theme: "light",
    contentTop: 92,
    userAvatar: "",
    userInitial: "走",
    groups: [],
    projectsByTime: [],
    unassociated: null,
    hasAnything: false,
    listMode: "type",
    openId: "",
    taskView: "open",
    expandedTaskId: "",
    submittingTaskId: "",
    submittingStageId: ""
  },

  onLoad() {
    this.setData({ contentTop: getContentTop() });
    this._lastLoadAt = 0;
    this._loadingWorkspace = null;
  },

  onShow() {
    const theme = this.syncTheme();
    this.syncUserHeader();
    syncTabBar(this, "desk", theme);
    if (!shouldRefresh("workspace", this._lastLoadAt)) return;
    this.loadWorkspace();
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

  loadWorkspace() {
    const { getWorkspace, getToken } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return Promise.resolve();
    }
    if (this._loadingWorkspace) return this._loadingWorkspace;

    this._loadingWorkspace = getWorkspace()
      .then((response) => {
        const result = response && response.result ? response.result : response;
        this.applyWorkspace(result || {});
        this._lastLoadAt = Date.now();
      })
      .catch((error) => {
        if (error && error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "文件没加载出来", icon: "none" });
      })
      .then(() => {
        this._loadingWorkspace = null;
      });
    return this._loadingWorkspace;
  },

  applyWorkspace(result) {
    const projects = (result.projects || []).map(decorateProject);
    const unassociated = decorateUnassociated(result.unassociatedTasks || []);
    const groups = MODE_ORDER
      .map((mode) => ({
        mode,
        label: MODE_META[mode].label,
        projects: projects.filter((project) => project.modeKey === mode)
      }))
      .filter((group) => group.projects.length > 0);
    const projectsByTime = [...projects].sort((a, b) => {
      const left = parseDate(a.updatedAt);
      const right = parseDate(b.updatedAt);
      return (right ? right.getTime() : 0) - (left ? left.getTime() : 0);
    });
    const openIdExists = projects.some((project) => project.id === this.data.openId) || this.data.openId === "__unassigned__";
    const nextOpenId = openIdExists && this.data.openId !== "__unassigned__"
      ? this.data.openId
      : openIdExists && unassociated
        ? this.data.openId
        : "";

    this.setData({
      groups,
      projectsByTime,
      unassociated,
      hasAnything: projects.length > 0 || Boolean(unassociated),
      openId: nextOpenId
    });
  },

  onFolderTap(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    this.setData({
      openId: this.data.openId === id ? "" : id,
      taskView: "open",
      expandedTaskId: ""
    });
  },

  onTaskViewTap(event) {
    const view = event.currentTarget.dataset.view;
    if (view !== "open" && view !== "done") return;
    this.setData({ taskView: view, expandedTaskId: "" });
  },

  onToggleListMode() {
    this.setData({
      listMode: this.data.listMode === "type" ? "time" : "type",
      expandedTaskId: ""
    });
  },

  onTaskExpandTap(event) {
    const taskId = event.currentTarget.dataset.id;
    if (!taskId) return;
    this.setData({
      expandedTaskId: this.data.expandedTaskId === taskId ? "" : taskId
    });
  },

  onStickyChange(event) {
    const taskId = event.currentTarget.dataset.id;
    const stickyNotes = Array.isArray(event.detail.notes) ? event.detail.notes : [];
    if (!taskId) return;
    const patchProject = (project) => {
      if (!project) return project;
      const patchTask = (task) => task.id === taskId ? { ...task, stickyNotes } : task;
      return {
        ...project,
        openTasks: (project.openTasks || []).map(patchTask),
        doneTasks: (project.doneTasks || []).map(patchTask),
      };
    };
    this.setData({
      groups: (this.data.groups || []).map((group) => ({
        ...group,
        projects: (group.projects || []).map(patchProject),
      })),
      projectsByTime: (this.data.projectsByTime || []).map(patchProject),
      unassociated: patchProject(this.data.unassociated),
    });
  },

  // 复盘目前是独立页面：文件页只负责给入口（与网页探索项目的「复盘」一致）。
  onOpenReview(event) {
    const date = event.currentTarget.dataset.date;
    const url = date
      ? `/pages/review/review?date=${date}`
      : "/pages/review/review";
    wx.navigateTo({ url });
  },

  onAdvanceStage(event) {
    const stageId = event.currentTarget.dataset.id;
    if (!stageId || this.data.submittingStageId) return;
    const { advanceStage } = require("../../utils/api");
    this.setData({ submittingStageId: stageId });
    wx.showLoading({ title: "正在进入下一阶段..." });
    advanceStage(stageId)
      .then(() => {
        markDataChanged(["workspace", "profile"]);
        wx.hideLoading();
        this.setData({ submittingStageId: "" });
        this.loadWorkspace();
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ submittingStageId: "" });
        if (error && error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "没能进入下一阶段，再试一次", icon: "none" });
      });
  },

  onTaskStatusTap(event) {
    const taskId = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    if (!taskId || !status || this.data.submittingTaskId) return;

    const { setTaskStatus } = require("../../utils/api");
    this.setData({ submittingTaskId: taskId });
    setTaskStatus(taskId, status)
      .then(() => {
        markDataChanged(["today", "workspace", "profile"]);
        this.setData({ submittingTaskId: "" });
        this.loadWorkspace();
      })
      .catch((error) => {
        this.setData({ submittingTaskId: "" });
        if (error && error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "状态没更新成功", icon: "none" });
      });
  },


  onProfileTap() {
    openTab("profile");
  },

});
