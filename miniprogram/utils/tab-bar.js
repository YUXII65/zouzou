const TAB_ROUTES = {
  today: "/pages/today/today",
  desk: "/pages/workspace/workspace",
  profile: "/pages/profile/profile"
};

const TAB_INDEX = {
  today: 0,
  desk: 1,
  profile: 2
};

function openTab(key) {
  const url = TAB_ROUTES[key];
  if (!url) return;
  wx.switchTab({ url });
}

function syncTabBar(page, key, theme) {
  if (!page || typeof page.getTabBar !== "function") return;
  const tabBar = page.getTabBar();
  if (!tabBar || !tabBar.setData) return;
  tabBar.setData({
    selected: TAB_INDEX[key] || 0,
    theme: theme || "light"
  });
}

module.exports = { openTab, syncTabBar, TAB_ROUTES };
