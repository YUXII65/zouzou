// 旧链接兜底：与网页 /tools → /files 的 302 行为一致。
const { openTab } = require("../../utils/tab-bar");

Page({
  onLoad() {
    openTab("desk");
  }
});
