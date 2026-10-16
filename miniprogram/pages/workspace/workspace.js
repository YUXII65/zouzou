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
  const stickyNote = Array.isArray(task.stickyNotes) && task.stickyNotes.length
    ? task.stickyNotes[0]
    : null;
  const today = formatDateKey(new Date());
  const scheduledDate = parseDate(task.scheduledDate);
  const focusDate = parseDate(task.focusDate);
  const status = task.status || "todo";
  const nextStatus = status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "";

  return {
    ...task,
    sticky: stickyNote
      ? {
          id: stickyNote.id,
          title: stickyNote.title,
          encouragement: stickyNote.encouragement,
          steps: Array.isArray(stickyNote.steps) ? stickyNote.steps : [],
          nextStep: stickyNote.nextStep,
        }
      : null,
    displayTitle: task.shortTitle && task.shortTitle.trim() ? task.shortTitle.trim() : fallbackTitle(task.title),
    priorityLabel: PRIORITY_LABELS[task.priority] || "中",
    dueDateText: formatDate(dueDate),
    scheduledDateText: formatDate(scheduledDate),
    completedAtText: formatDate(task.completedAt),
    isOverdue: Boolean(dueDate && formatDateKey(dueDate) < today && status !== "done"),
    isScheduled: Boolean(scheduledDate && formatDateKey(scheduledDate) === today),
    isFocused: Boolean(focusDate && formatDateKey(focusDate) === today),
    canChangeStatus: status !== "done",
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
    canAdvance: stage.status === "ready" && nextTasks.length > 0
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

  return {
    ...project,
    id: project.id,
    modeKey,
    modeLabel: MODE_META[modeKey].label,
    openTasks,
    doneTasks,
    openCount: openTasks.length,
    doneCount: doneTasks.length,
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

Page({
  data: {
    theme: "light",
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
    this._loaded = false;
  },

  onShow() {
    this.syncTheme();
    this.syncUserHeader();
    this.loadWorkspace();
  },

  syncTheme() {
    const { getTheme } = require("../../utils/theme");
    this.setData({ theme: getTheme() });
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

  loadWorkspace() {
    const { getWorkspace, getToken } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    getWorkspace()
      .then((response) => {
        const result = response && response.result ? response.result : response;
        this.applyWorkspace(result || {});
      })
      .catch((error) => {
        if (error && error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "文件没加载出来", icon: "none" });
      });
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
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

});
