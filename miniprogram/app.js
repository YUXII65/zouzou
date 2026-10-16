const { cloudEnv } = require("./config");

App({
  globalData: {
    appName: "走走"
  },

  onLaunch() {
    if (cloudEnv && wx.cloud) {
      wx.cloud.init({ env: cloudEnv, traceUser: true });
    }

    const { getToken, getMe, setCachedUser, applyPrefetchedToday } = require("./utils/api");
    if (!getToken()) return;
    // 冷启动先把微信预拉取的 today 数据落盘，首屏秒开。
    applyPrefetchedToday();
    getMe()
      .then((result) => setCachedUser(result.user))
      .catch(() => {});
  }
});
