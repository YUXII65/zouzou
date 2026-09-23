Page({
  data: {
    username: "",
    password: ""
  },

  onReady() {
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
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
        const message = error.code === "service_unavailable"
          ? "服务暂时不可用，请稍后重试"
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
