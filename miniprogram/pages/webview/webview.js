const { webUrl } = require("../../config");

Page({
  data: {
    url: webUrl
  },

  onLoad(options) {
    const nextPath = typeof options.path === "string" ? decodeURIComponent(options.path) : "";
    if (nextPath.startsWith("/")) {
      this.setData({ url: webUrl.replace(/\/$/, "") + nextPath });
    }
  },

  onError() {
    wx.showToast({
      title: "网页加载失败",
      icon: "none"
    });
  }
});
