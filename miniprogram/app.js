App({
  globalData: {
    appName: "走走"
  },

  onLaunch() {
    const { getToken, getMe, setCachedUser } = require("./utils/api");
    if (!getToken()) return;
    getMe()
      .then((result) => setCachedUser(result.user))
      .catch(() => {});
  }
});