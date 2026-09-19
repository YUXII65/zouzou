const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" }
];

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
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
    dateText: "",
    weekdayText: "",
    timeText: "",
    completedToday: 0,
    totalToday: 0,
    streak: 0,
    weekDone: 0,
    content: "",
    samples: [
      "把拖了很久的简历重新整理一遍",
      "这周把项目复盘写出来",
      "想清楚要不要继续做这个方向"
    ],
    priorityLabels: PRIORITY_OPTIONS.map((item) => item.label),
    pendingItems: [],
    tasks: [],
    submittingPlanId: "",
    submittingClarifyId: "",
    ignoringInboxId: ""
  },

  onLoad() {
    this.updateClock();
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
    this.updateClock();
    this.syncUserHeader();
    this.loadToday();
  },

  loadToday() {
    const { getToken, getToday } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }

    getToday()
      .then((result) => {
        this.setData({
          completedToday: result.completedToday || 0,
          totalToday: result.totalToday || 0,
          streak: result.streak || 0,
          weekDone: result.weekDone || 0,
          pendingItems: (result.pendingItems || []).map((item) => {
            const plan = parseJson(item.aiPlanJson);
            const clarification = parseJson(item.aiSuggestionJson);
            const dimensions = normalizeDimensions(clarification);
            const actionLabels = {
              create_project: "新建项目",
              existing_project: "归入项目",
              single_task: "创建任务",
              ignore: "建议忽略"
            };
            const hasPlan = Boolean(plan && plan.action !== "ignore" && Array.isArray(plan.tasks) && plan.tasks.length);
            const action = hasPlan
              ? (actionLabels[plan.action] || "已整理")
              : dimensions.length
                ? "需要补充"
                : "正在梳理...";

            return {
              id: item.id,
              content: item.content,
              action,
              reason: plan && plan.reason ? plan.reason : "",
              showProjectFields: Boolean(plan && (plan.action !== "single_task" || plan.projectName)),
              projectName: plan && plan.projectName ? plan.projectName : "",
              projectObjective: plan && plan.projectObjective ? plan.projectObjective : "",
              projectMilestone: plan && plan.projectMilestone ? plan.projectMilestone : "",
              planTasks: hasPlan
                ? plan.tasks.map((task) => {
                    const index = priorityIndex(task.priority);
                    return {
                      title: task.title || "",
                      shortTitle: task.shortTitle || "",
                      notes: task.notes || "",
                      priority: PRIORITY_OPTIONS[index].value,
                      priorityIndex: index,
                      priorityLabel: PRIORITY_OPTIONS[index].label,
                      scheduledDate: task.scheduledDate || "",
                      dueDate: task.dueDate || ""
                    };
                  })
                : [],
              dimensions,
              supplement: "",
              supplementPlaceholder: clarification && clarification.supplementPlaceholder
                ? clarification.supplementPlaceholder
                : "如果这些选项都不准确，可以补充两句。"
            };
          }),
          tasks: (result.tasks || []).map((task) => ({
            ...task,
            priorityLabel: (PRIORITY_OPTIONS.find((item) => item.value === task.priority) || PRIORITY_OPTIONS[1]).label,
            actionLabel: task.status === "todo"
              ? "下一步"
              : task.status === "in_progress"
                ? "完成"
                : "重新开始",
            nextStatus: task.status === "todo"
              ? "in_progress"
              : task.status === "in_progress"
                ? "done"
                : "todo"
          }))
        });
      })
      .catch((error) => {
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "今日数据没加载出来", icon: "none" });
      });
  },

  updateClock() {
    const now = new Date();
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const dateText = String(now.getDate()).padStart(2, "0");
    const weekdayText = `${now.getMonth() + 1}月 ${weekdays[now.getDay()]}`;
    const timeText = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    this.setData({ dateText, weekdayText, timeText });
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value });
  },

  onSampleTap(event) {
    this.setData({ content: event.currentTarget.dataset.sample || "" });
  },

  onRefreshSamples() {
    const pool = [
      "把最近收藏的工具整理成一套流程",
      "准备一次重要的沟通",
      "把一个停下来的项目重新推起来",
      "安排这周真正要完成的三件事"
    ];
    const start = Math.floor(Math.random() * pool.length);
    const samples = [0, 1, 2].map((offset) => pool[(start + offset) % pool.length]);
    this.setData({ samples });
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
      .then(() => {
        this.setData({ content: "" });
        wx.hideLoading();
        wx.showToast({ title: "已收进收件箱", icon: "none" });
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

    const dimensionChoices = item.dimensions.map((dimension) =>
      dimension.options.filter((option) => option.selected).map((option) => option.label).join("、")
    );
    if (dimensionChoices.some((choice) => !choice)) {
      wx.showToast({ title: "先把每个方向选一下", icon: "none" });
      return;
    }
    const option = dimensionChoices.find(Boolean) || "";
    const { planInbox } = require("../../utils/api");
    this.setData({ submittingClarifyId: item.id });
    wx.showLoading({ title: "正在拆解..." });
    planInbox({
      itemId: item.id,
      option,
      dimensionChoices,
      supplement: item.supplement || ""
    })
      .then(() => {
        wx.hideLoading();
        this.setData({ submittingClarifyId: "" });
        wx.showToast({ title: "计划已生成", icon: "success" });
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ submittingClarifyId: "" });
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "这次没拆出来，再试一次", icon: "none" });
      });
  },

  onPlanProjectInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const field = event.currentTarget.dataset.field;
    if (Number.isNaN(itemIndex) || !field) return;
    this.setData({ [`pendingItems[${itemIndex}].${field}`]: event.detail.value });
  },

  onPlanTaskInput(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const taskIndex = Number(event.currentTarget.dataset.taskIndex);
    const field = event.currentTarget.dataset.field;
    if (Number.isNaN(itemIndex) || Number.isNaN(taskIndex) || !field) return;
    this.setData({ [`pendingItems[${itemIndex}].planTasks[${taskIndex}].${field}`]: event.detail.value });
  },

  onPlanPriorityChange(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const taskIndex = Number(event.currentTarget.dataset.taskIndex);
    const selectedIndex = Number(event.detail.value);
    const priority = PRIORITY_OPTIONS[selectedIndex] || PRIORITY_OPTIONS[1];
    if (Number.isNaN(itemIndex) || Number.isNaN(taskIndex)) return;
    this.setData({
      [`pendingItems[${itemIndex}].planTasks[${taskIndex}].priority`]: priority.value,
      [`pendingItems[${itemIndex}].planTasks[${taskIndex}].priorityIndex`]: selectedIndex,
      [`pendingItems[${itemIndex}].planTasks[${taskIndex}].priorityLabel`]: priority.label
    });
  },

  onPlanDateChange(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const taskIndex = Number(event.currentTarget.dataset.taskIndex);
    const field = event.currentTarget.dataset.field;
    if (Number.isNaN(itemIndex) || Number.isNaN(taskIndex) || !field) return;
    this.setData({ [`pendingItems[${itemIndex}].planTasks[${taskIndex}].${field}`]: event.detail.value });
  },

  onConfirmPlan(event) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex);
    const item = this.data.pendingItems[itemIndex];
    if (!item || this.data.submittingPlanId) return;

    const { confirmPlan } = require("../../utils/api");
    this.setData({ submittingPlanId: item.id });
    wx.showLoading({ title: "正在生成..." });
    confirmPlan({
      itemId: item.id,
      projectName: item.projectName,
      projectObjective: item.projectObjective,
      projectMilestone: item.projectMilestone,
      tasks: item.planTasks.map((task) => ({
        title: task.title,
        shortTitle: task.shortTitle,
        notes: task.notes,
        priority: task.priority,
        scheduledDate: task.scheduledDate,
        dueDate: task.dueDate
      }))
    })
      .then((result) => {
        wx.hideLoading();
        this.setData({ submittingPlanId: "" });
        wx.showToast({ title: `已创建 ${result.taskCount} 个任务`, icon: "none" });
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ submittingPlanId: "" });
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "创建失败，再试一次", icon: "none" });
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

  onTaskEditTap(event) {
    const taskId = event.currentTarget.dataset.id;
    if (!taskId) return;
    wx.navigateTo({ url: `/pages/task-edit/task-edit?id=${encodeURIComponent(taskId)}` });
  },

  onProfileTap() { wx.navigateTo({ url: "/pages/profile/profile" }); },

  onToolsTap() {
    wx.reLaunch({ url: "/pages/tools/tools" });
  },

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