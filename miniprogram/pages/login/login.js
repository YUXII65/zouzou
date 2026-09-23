Page({
  data: {
    username: "",
    password: "",
    bgStyle: ""
  },

  onLoad() {
    this.updateBackground();
  },

  onReady() {
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this.updateBackground();
  },

  onResize() {
    this.updateBackground();
  },

  updateBackground() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const width = info.windowWidth || 375;
    const height = info.windowHeight || 667;
    const size = Math.max(width, height) * 1.45;
    const left = (width - size) / 2;
    const top = (height - size) / 2;
    this.setData({
      bgStyle: `width:${size}px;height:${size}px;left:${left}px;top:${top}px;`
    });
  },

  onUsernameInput(event) {
    this.setData({ username: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  onConfirm() {
    if (!this.data.username.trim() || !this.data.password) {
      wx.showToast({ title: "请填写用户名和密码", icon: "none" });
      return;
    }

    const { loginOrRegister, setToken, setCachedUser, getOnboarding } = require("../../utils/api");
    wx.showLoading({ title: "正在登录..." });
    loginOrRegister(this.data.username.trim(), this.data.password)
      .then((result) => {
        setToken(result.token);
        setCachedUser(result.user);
        wx.hideLoading();
        getOnboarding()
          .then((state) => {
            wx.reLaunch({ url: state.isFirstRun && state.tourStep !== "done" ? "/pages/onboarding/onboarding" : "/pages/today/today" });
          })
          .catch(() => wx.reLaunch({ url: "/pages/today/today" }));
      })
      .catch((error) => {
        wx.hideLoading();
        console.error("[miniprogram login]", error);
        if (error.code === "network_failed") {
          wx.showModal({
            title: "连接失败",
            content: error.errMsg || "无法连接服务器，请检查小程序后台的 request 合法域名。",
            showCancel: false
          });
          return;
        }
        const message = error.code === "service_unavailable"
          ? "服务暂时不可用，请稍后重试"
          : error.code === "invalid_username"
            ? "用户名需 2-20 位"
            : error.code === "password_too_short"
              ? "新账号密码至少 6 位"
              : error.code === "invalid_password"
                ? "该用户名已注册，请输入第一次设置的密码"
                : error.code === "username_exists"
                  ? "用户名已存在，请换一个用户名"
                  : "用户名或密码不对";
        wx.showToast({ title: message, icon: "none" });
      });
  },

  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.reLaunch({ url: "/pages/index/index" })
    });
  }
});
