Page({
  data: {
    projects: []
  },

  onNewProject() {
    wx.showToast({ title: "项目接口接入中", icon: "none" });
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
    if (key === "desk" || !routes[key]) return;
    wx.reLaunch({ url: routes[key] });
  }
});