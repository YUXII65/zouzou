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

    const { loginOrRegister, setToken } = require("../../utils/api");
    wx.showLoading({ title: "正在登录..." });
    loginOrRegister(this.data.username.trim(), this.data.password)
      .then((result) => {
        setToken(result.token);
        wx.hideLoading();
        wx.reLaunch({ url: "/pages/today/today" });
      })
      .catch((error) => {
        wx.hideLoading();
        const message = error.code === "username_exists"
          ? "用户名已存在，请输入正确密码"
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