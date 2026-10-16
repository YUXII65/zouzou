// 旧链接兜底：与网页 /tools → /files 的 302 行为一致。
Page({
  onLoad() {
    wx.reLaunch({ url: "/pages/workspace/workspace" });
  }
});
