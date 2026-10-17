function getContentTop() {
  try {
    const menu = wx.getMenuButtonBoundingClientRect();
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = Number(info.statusBarHeight) || 20;
    return Math.max(statusBarHeight + 48, Number(menu.bottom) + 14);
  } catch (error) {
    return 92;
  }
}

module.exports = { getContentTop };
