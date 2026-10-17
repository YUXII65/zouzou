const VERSION_KEY = "next_step_mp_tab_data_versions";
const ALL_SCOPES = ["today", "workspace", "profile"];

function readVersions() {
  try {
    const value = wx.getStorageSync(VERSION_KEY);
    return value && typeof value === "object" ? value : {};
  } catch (error) {
    return {};
  }
}

function markDataChanged(scopes) {
  const targets = Array.isArray(scopes) && scopes.length ? scopes : ALL_SCOPES;
  const versions = readVersions();
  const now = Date.now();
  targets.forEach((scope) => {
    versions[scope] = now;
  });
  try {
    wx.setStorageSync(VERSION_KEY, versions);
  } catch (error) {
    // 存储不可用时仍允许页面继续刷新。
  }
}

function shouldRefresh(scope, lastLoadAt, maxAge) {
  if (!lastLoadAt) return true;
  const versions = readVersions();
  if (Number(versions[scope]) > lastLoadAt) return true;
  return Date.now() - lastLoadAt >= (maxAge || 30000);
}

module.exports = { markDataChanged, shouldRefresh };
