const { cloudEnv } = require("./config");

App({
  globalData: {
    appName: "走走"
  },

  onLaunch() {
    if (cloudEnv && wx.cloud) {
      wx.cloud.init({ env: cloudEnv, traceUser: true });
    }

    const { getToken, getMe, setCachedUser } = require("./utils/api");
    if (!getToken()) return;
    getMe()
      .then((result) => setCachedUser(result.user))
      .catch(() => {});
  }
});
