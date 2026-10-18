function getContentTop() {
  try {
    const menu = wx.getMenuButtonBoundingClientRect();
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = Number(info.statusBarHeight) || 20;
    return Math.max(statusBarHeight + 68, Number(menu.bottom) + 18);
  } catch (error) {
    return 112;
  }
}

module.exports = { getContentTop };
