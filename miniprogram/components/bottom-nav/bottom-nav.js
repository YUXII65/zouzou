Component({
  properties: {
    active: { type: String, value: "" },
    theme: { type: String, value: "light" }
  },

  methods: {
    onTabTap(event) {
      const key = event.currentTarget.dataset.key;
      if (key === this.data.active) return;
      if (key === "today") {
        wx.reLaunch({ url: "/pages/today/today" });
        return;
      }
      if (key === "desk") {
        wx.reLaunch({ url: "/pages/workspace/workspace" });
        return;
      }
      if (key === "profile") {
        wx.reLaunch({ url: "/pages/profile/profile" });
      }
    }
  }
});
