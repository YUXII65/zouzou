Page({
  data: {
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
    pendingItems: [],
    tasks: []
  },

  onLoad() {
    this.updateClock();
  },

  onShow() {
    this.updateClock();
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
            let plan = null;
            let clarification = null;
            try {
              plan = item.aiPlanJson ? JSON.parse(item.aiPlanJson) : null;
            } catch {
              plan = null;
            }
            try {
              clarification = item.aiSuggestionJson
                ? JSON.parse(item.aiSuggestionJson)
                : null;
            } catch {
              clarification = null;
            }

            const dimensions = clarification && Array.isArray(clarification.dimensions)
              ? clarification.dimensions
              : [];
            const options = dimensions[0] && Array.isArray(dimensions[0].options)
              ? dimensions[0].options
              : [];
            const actionLabels = {
              create_project: "新建项目",
              existing_project: "归入项目",
              single_task: "创建任务",
              ignore: "建议忽略"
            };
            const action = plan
              ? (actionLabels[plan.action] || "已整理")
              : options.length
                ? "需要补充"
                : "正在梳理...";

            return {
              id: item.id,
              content: item.content,
              action,
              options,
              planTasks: plan && Array.isArray(plan.tasks) ? plan.tasks : []
            };
          }),
          tasks: (result.tasks || []).map((task) => ({
            ...task,
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
    wx.showLoading({ title: "正在收下..." });
    clarifyIdea(content)
      .then(() => {
        this.setData({ content: "" });
        wx.hideLoading();
        wx.showToast({ title: "正在整理，已收进收件箱", icon: "none" });
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
    const itemId = event.currentTarget.dataset.id;
    const option = event.currentTarget.dataset.option;
    if (!itemId || !option) return;

    const { planInbox } = require("../../utils/api");
    wx.showLoading({ title: "正在拆解..." });
    planInbox({ itemId, option })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "计划已生成", icon: "success" });
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "这次没拆出来，再试一次", icon: "none" });
      });
  },
  onConfirmPlan(event) {
    const itemId = event.currentTarget.dataset.id;
    if (!itemId) return;

    const { confirmPlan } = require("../../utils/api");
    wx.showLoading({ title: "正在创建..." });
    confirmPlan(itemId)
      .then((result) => {
        wx.hideLoading();
        wx.showToast({ title: `已创建 ${result.taskCount} 个任务`, icon: "none" });
        this.loadToday();
      })
      .catch((error) => {
        wx.hideLoading();
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "创建失败，再试一次", icon: "none" });
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
    wx.navigateTo({ url: /pages/task-edit/task-edit?id= });
  },

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