Page({
  data: {
    enabled: [],
    pendingInbox: 0,
    openTasks: 0,
    doneTasks: 0,
    weekReviewCount: 0,
    weekCompleted: 0,
    weekOpen: 0,
    weekProjects: 0,
    stalledProjects: [],
    feedbackCount: 0,
    modules: [
      { id: "focus", name: "专注计时", description: "给今日重点任务计时，避免一上午都在低效忙碌。", badge: "可用", icon: "◷", available: true },
      { id: "weekly", name: "周复盘", description: "每周回看项目推进情况，并自动生成下周重点。", badge: "可用", icon: "☑", available: true },
      { id: "reminders", name: "日历提醒", description: "把今日计划和截止日期变成提醒，降低忘记打开的阻力。", badge: "暂不开放", icon: "▦", available: false },
      { id: "ai-execute", name: "AI 执行接入", description: "以后把可执行任务交给 Codex / WorkBuddy 等外部 Agent。", badge: "暂不开放", icon: "✦", available: false }
    ],
    timerMode: 25,
    timerSeconds: 1500,
    timerText: "25:00",
    timerRunning: false,
    timerFinished: false
  },

  timerId: null,

  onShow() {
    this.loadTools();
  },

  loadTools() {
    const { getToken, getTools } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }

    getTools()
      .then((result) => {
        this.setData({
          pendingInbox: result.pendingInbox || 0,
          openTasks: result.openTasks || 0,
          doneTasks: result.doneTasks || 0,
          weekReviewCount: result.weekReviewCount || 0,
          weekCompleted: result.weekCompleted || 0,
          weekOpen: result.weekOpen || 0,
          weekProjects: result.weekProjects || 0,
          stalledProjects: result.stalledProjects || [],
          feedbackCount: result.feedbackCount || 0
        });
      })
      .catch((error) => {
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "工具数据没加载出来", icon: "none" });
      });
  },

  onUnload() { this.clearTimer(); },

  clearTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },

  formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  },

  isEnabled(id) { return this.data.enabled.includes(id); },

  onModuleTap(event) {
    const id = event.currentTarget.dataset.id;
    const module = this.data.modules.find((item) => item.id === id);
    if (!module || !module.available) return;

    if (this.isEnabled(id)) {
      if (id === "focus") this.clearTimer();
      this.setData({ enabled: this.data.enabled.filter((item) => item !== id), timerRunning: false });
      return;
    }
    this.setData({ enabled: this.data.enabled.concat(id) });
  },

  chooseMode(event) {
    const minutes = Number(event.currentTarget.dataset.minutes);
    this.clearTimer();
    const seconds = minutes * 60;
    this.setData({ timerMode: minutes, timerSeconds: seconds, timerText: this.formatTime(seconds), timerRunning: false, timerFinished: false });
  },

  toggleTimer() {
    if (this.data.timerFinished) {
      this.setData({ timerSeconds: this.data.timerMode * 60, timerText: this.formatTime(this.data.timerMode * 60), timerFinished: false });
    }

    if (this.data.timerRunning) {
      this.clearTimer();
      this.setData({ timerRunning: false });
      return;
    }

    this.setData({ timerRunning: true });
    this.timerId = setInterval(() => {
      const next = Math.max(0, this.data.timerSeconds - 1);
      this.setData({ timerSeconds: next, timerText: this.formatTime(next), timerFinished: next === 0, timerRunning: next > 0 });
      if (next === 0) this.clearTimer();
    }, 1000);
  },

  resetTimer() {
    this.clearTimer();
    const seconds = this.data.timerMode * 60;
    this.setData({ timerSeconds: seconds, timerText: this.formatTime(seconds), timerRunning: false, timerFinished: false });
  },

  onReviewTap() { wx.reLaunch({ url: "/pages/review/review" }); },

  onExport() { wx.showToast({ title: "导出接口接入中", icon: "none" }); },

  onTabTap(event) {
    const key = event.currentTarget.dataset.key;
    const routes = { today: "/pages/today/today", desk: "/pages/workspace/workspace", review: "/pages/review/review" };
    if (!routes[key]) return;
    wx.reLaunch({ url: routes[key] });
  }
});