Page({
  data: { username: "", displayName: "", avatarUrl: "" },
  onLoad() { this.loadProfile(); },
  loadProfile() {
    const { getToken, getMe } = require("../../utils/api");
    if (!getToken()) { wx.reLaunch({ url: "/pages/login/login" }); return; }
    getMe().then((result) => { const user = result.user; this.setData({ username: user.username || "", displayName: user.displayName || "", avatarUrl: user.avatarUrl || "" }); }).catch(() => wx.showToast({ title: "资料没加载出来", icon: "none" }));
  },
  onNameInput(event) { this.setData({ displayName: event.detail.value }); },
  onChooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const path = result.tempFilePaths[0];
        wx.getFileSystemManager().readFile({
          filePath: path,
          encoding: "base64",
          success: (file) => {
            const ext = path.split(".").pop().toLowerCase();
            const mime = ext === "png" ? "image/png" : "image/jpeg";
            this.setData({ avatarUrl: `data:${mime};base64,${file.data}` });
          },
          fail: () => wx.showToast({ title: "头像读取失败", icon: "none" })
        });
      }
    });
  },
  onSave() {
    const { updateProfile } = require("../../utils/api");
    wx.showLoading({ title: "正在保存..." });
    updateProfile({ displayName: this.data.displayName, avatarUrl: this.data.avatarUrl }).then(() => { wx.hideLoading(); wx.showToast({ title: "已保存", icon: "success" }); }).catch(() => { wx.hideLoading(); wx.showToast({ title: "保存失败", icon: "none" }); });
  },
  onLogout() {
    const { clearToken } = require("../../utils/api");
    wx.showModal({ title: "退出登录", content: "退出不会删除你的项目、任务和复盘。", success: (result) => { if (!result.confirm) return; clearToken(); wx.reLaunch({ url: "/pages/index/index" }); } });
  }
});