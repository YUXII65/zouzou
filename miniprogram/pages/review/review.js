Page({
  data: {
    date: ""
  },

  onLoad() {
    this.setData({ date: this.formatToday() });
  },

  formatToday() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  },

  onDateChange(event) {
    this.setData({ date: event.detail.value });
  },

  onGenerate() {
    wx.showToast({ title: "复盘接口接入中", icon: "none" });
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
    if (key === "review" || !routes[key]) return;
    wx.reLaunch({ url: routes[key] });
  }
});