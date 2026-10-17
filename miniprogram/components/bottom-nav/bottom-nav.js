const { openTab } = require("../../utils/tab-bar");

Component({
  properties: {
    active: { type: String, value: "" },
    theme: { type: String, value: "light" }
  },

  methods: {
    onTabTap(event) {
      const key = event.currentTarget.dataset.key;
      if (key === this.data.active) return;
      openTab(key);
    }
  }
});
