// 开发者工具可用 next_step_api_base 临时覆盖后端地址；真机和正式版仍走线上域名，配置方法见 docs/runbook.md。
const localApiBase = typeof wx !== "undefined"
  ? wx.getStorageSync("next_step_api_base")
  : "";
const productionApiBase = "https://nextstep9.work";
const apiBase = localApiBase || productionApiBase;

// 未备案域名不能用于真机 wx.request。
// 开通微信云开发后，把环境 ID 填在这里，所有请求会改走云函数代理。
const cloudEnv = "";

// 与网页 FIRST_RUN_GUIDE_ENABLED 保持一致：当前关闭四步欢迎流程。
const onboardingFlowEnabled = false;

module.exports = {
  apiBase,
  cloudEnv
};
