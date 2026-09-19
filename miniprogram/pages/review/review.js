Page({
  data: {
    date: "",
    reviewId: "",
    summary: "",
    nextActions: "",
    reviewStatus: "",
    tasks: [],
    completedCount: 0,
    openCount: 0
  },

  onLoad() {
    const date = this.formatToday();
    this.setData({ date });
    this.loadReview();
  },

  onShow() {
    if (this.data.date) this.loadReview();
  },

  formatToday() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  },

  loadReview() {
    const { getToken, getReview } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }

    getReview(this.data.date)
      .then((result) => {
        const review = result.review;
        if (!review) {
          this.setData({ reviewId: "", summary: "", nextActions: "", reviewStatus: "", tasks: [], completedCount: 0, openCount: 0 });
          return;
        }
        const completedCount = (review.tasks || []).filter((task) => task.status === "done").length;
        this.setData({
          reviewId: review.id,
          summary: review.summary || "",
          nextActions: review.nextActions || "",
          reviewStatus: review.status || "",
          tasks: review.tasks || [],
          completedCount,
          openCount: Math.max((review.tasks || []).length - completedCount, 0)
        });
      })
      .catch((error) => {
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "复盘没加载出来", icon: "none" });
      });
  },

  onDateChange(event) {
    this.setData({ date: event.detail.value });
    this.loadReview();
  },

  onSummaryInput(event) {
    this.setData({ summary: event.detail.value });
  },

  onNextActionsInput(event) {
    this.setData({ nextActions: event.detail.value });
  },

  onGenerate() {
    const { generateReviewDraft } = require("../../utils/api");
    wx.showLoading({ title: "正在回看..." });
    generateReviewDraft(this.data.date)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "复盘草稿已生成", icon: "success" });
        this.loadReview();
      })
      .catch((error) => {
        wx.hideLoading();
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "这次没整理出来", icon: "none" });
      });
  },

  onSave() {
    const { saveReview } = require("../../utils/api");
    if (!this.data.reviewId || !this.data.summary.trim()) {
      wx.showToast({ title: "先写下当日总结", icon: "none" });
      return;
    }

    wx.showLoading({ title: "正在保存..." });
    saveReview({ reviewId: this.data.reviewId, summary: this.data.summary, nextActions: this.data.nextActions })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "已保存", icon: "success" });
        this.loadReview();
      })
      .catch((error) => {
        wx.hideLoading();
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "没保存成功，再试一次", icon: "none" });
      });
  },

  onProfileTap() { wx.navigateTo({ url: "/pages/profile/profile" }); },

  onToolsTap() {
    wx.reLaunch({ url: "/pages/tools/tools" });
  },

  onTabTap(event) {
    const key = event.currentTarget.dataset.key;
    const routes = { today: "/pages/today/today", desk: "/pages/workspace/workspace", review: "/pages/review/review" };
    if (key === "review" || !routes[key]) return;
    wx.reLaunch({ url: routes[key] });
  }
});