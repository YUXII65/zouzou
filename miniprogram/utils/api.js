const { apiBase } = require("../config");

const TOKEN_KEY = "next_step_miniprogram_token";

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

function request(path, options = {}) {
  const token = getToken();
  const header = Object.assign(
    { "Content-Type": "application/json" },
    options.header || {},
  );
  if (token) header.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase}${path}`,
      method: options.method || "GET",
      data: options.data,
      header,
      timeout: 25000,
      success(response) {
        const status = response.statusCode;
        if (status >= 200 && status < 300) {
          resolve(response.data);
          return;
        }

        const body = response.data || {};
        const error = new Error(body.error || `HTTP ${status}`);
        error.statusCode = status;
        error.code = body.error || "";
        if (status === 401) clearToken();
        reject(error);
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function login(username, password) {
  return request("/api/miniprogram/auth/login", {
    method: "POST",
    data: { username, password },
  });
}

function register(username, password) {
  return request("/api/miniprogram/auth/register", {
    method: "POST",
    data: { username, password },
  });
}

async function loginOrRegister(username, password) {
  try {
    return await login(username, password);
  } catch (error) {
    if (error.code === "invalid_credentials" || error.statusCode === 401) {
      return register(username, password);
    }
    throw error;
  }
}

function getMe() {
  return request("/api/miniprogram/me");
}

function getToday() {
  return request("/api/miniprogram/today");
}

function getTools() {
  return request("/api/miniprogram/tools");
}

function createInboxItem(content) {
  return request("/api/miniprogram/inbox", {
    method: "POST",
    data: { content }
  });
}

function clarifyIdea(content) {
  return request("/api/miniprogram/ai/inbox/clarify", {
    method: "POST",
    data: { content }
  });
}

function planInbox(data) {
  return request("/api/miniprogram/ai/inbox/plan", {
    method: "POST",
    data
  });
}

function confirmPlan(itemId) {
  return request("/api/miniprogram/inbox/confirm", {
    method: "POST",
    data: { itemId }
  });
}

module.exports = {
  request,
  getToken,
  setToken,
  clearToken,
  loginOrRegister,
  getMe,
  getToday,
  getTools,
  createInboxItem,
  clarifyIdea,
  planInbox,
  confirmPlan,
};