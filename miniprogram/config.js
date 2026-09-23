const apiBase = "https://nextstep9.work";

// 未备案域名不能用于真机 wx.request。
// 开通微信云开发后，把环境 ID 填在这里，所有请求会改走云函数代理。
const cloudEnv = "";

module.exports = {
  apiBase,
  cloudEnv
};
