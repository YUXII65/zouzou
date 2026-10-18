Component({
  properties: {
    theme: { type: String, value: "light" }
  },

  data: {
    statusBarHeight: 20
  },

  lifetimes: {
    attached() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: Number(info.statusBarHeight) || 20 });
    }
  }
});
