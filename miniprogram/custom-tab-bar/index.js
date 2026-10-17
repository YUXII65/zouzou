const { getTheme } = require("../utils/theme");
const { openTab } = require("../utils/tab-bar");

const TAB_KEYS = ["today", "desk", "profile"];
const ROUTE_KEYS = {
  "pages/today/today": "today",
  "pages/workspace/workspace": "desk",
  "pages/profile/profile": "profile"
};

Component({
  data: {
    selected: 0,
    theme: "light"
  },

  lifetimes: {
    attached() {
      this.syncFromRoute();
      this.syncTheme();
    }
  },

  pageLifetimes: {
    show() {
      this.syncFromRoute();
      this.syncTheme();
    }
  },

  methods: {
    syncFromRoute() {
      const pages = getCurrentPages();
      const page = pages.length ? pages[pages.length - 1] : null;
      const key = page && ROUTE_KEYS[page.route];
      const selected = key ? TAB_KEYS.indexOf(key) : 0;
      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({ selected });
      }
    },

    syncTheme() {
      const theme = getTheme();
      if (theme !== this.data.theme) this.setData({ theme });
    },

    onTabTap(event) {
      const key = event.currentTarget.dataset.key;
      if (TAB_KEYS[this.data.selected] === key) return;
      openTab(key);
    }
  }
});
