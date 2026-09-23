const { apiBase, cloudEnv } = require("../config");

const TOKEN_KEY = "next_step_miniprogram_token";
const USER_KEY = "next_step_miniprogram_user";

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}


function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}

function setCachedUser(user) {
  if (user) wx.setStorageSync(USER_KEY, user);
}

function getCachedUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

function networkError(error, fallback) {
  const errMsg = error && error.errMsg ? error.errMsg : fallback;
  const wrapped = new Error(errMsg);
  wrapped.code = "network_failed";
  wrapped.errMsg = errMsg;
  return wrapped;
}

function cloudRequest(path, options, token) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: "apiProxy",
      data: {
        path,
        method: options.method || "GET",
        data: options.data,
        token,
      },
      success(response) {
        const result = response.result || {};
        const status = Number(result.statusCode) || 500;
        if (status >= 200 && status < 300) {
          resolve(result.data);
          return;
        }

        const body =
          result.data && typeof result.data === "object" ? result.data : {};
        const error = new Error(body.error || `HTTP ${status}`);
        error.statusCode = status;
        error.code = body.error || "";
        if (status === 401) clearToken();
        reject(error);
      },
      fail(error) {
        reject(networkError(error, "云函数调用失败"));
      },
    });
  });
}

function wxRequest(path, options, token) {
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
        reject(networkError(error, "网络请求失败"));
      },
    });
  });
}

function request(path, options = {}) {
  const token = getToken();
  if (cloudEnv && wx.cloud) {
    return cloudRequest(path, options, token);
  }
  return wxRequest(path, options, token);
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
  // 登录接口会同时处理“已存在则登录、不存在则注册”，
  // 不要在这里看到 401 就再注册，否则密码错误会被误报成用户名已存在。
  return login(username, password);
}

function getOnboarding() {
  return request("/api/miniprogram/onboarding");
}

function setOnboardingStep(step) {
  return request("/api/miniprogram/onboarding", {
    method: "POST",
    data: { step }
  });
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


function confirmPlan(data) {
  const payload = typeof data === "string" ? { itemId: data } : data;
  return request("/api/miniprogram/inbox/confirm", {
    method: "POST",
    data: payload
  });
}

function ignoreInbox(itemId) {
  return request("/api/miniprogram/inbox/ignore", {
    method: "POST",
    data: { itemId }
  });
}

function setTaskStatus(taskId, status) {
  return request("/api/miniprogram/tasks/status", {
    method: "POST",
    data: { taskId, status }
  });
}

function generateReviewDraft(reviewDate) {
  return request("/api/miniprogram/ai/review/draft", {
    method: "POST",
    data: { reviewDate }
  });
}

function getReview(date) {
  return request(`/api/miniprogram/review?date=${encodeURIComponent(date)}`);
}

function saveReview(data) {
  return request("/api/miniprogram/review/save", {
    method: "POST",
    data
  });
}

function sendReviewFeedback(reviewId, action) {
  return request("/api/miniprogram/review/feedback", {
    method: "POST",
    data: { reviewId, action }
  });
}

function getWorkspace() {
  return request("/api/miniprogram/workspace");
}

function createProject(data) {
  return request("/api/miniprogram/projects", {
    method: "POST",
    data
  });
}

function updateProject(data) {
  return request("/api/miniprogram/projects/update", {
    method: "POST",
    data
  });
}

function deleteProject(projectId) {
  return request("/api/miniprogram/projects/delete", {
    method: "POST",
    data: { projectId }
  });
}

function createTask(data) {
  return request("/api/miniprogram/tasks", {
    method: "POST",
    data
  });
}

function getTaskDetail(taskId) {
  return request(`/api/miniprogram/tasks/detail?id=${encodeURIComponent(taskId)}`);
}

function updateTask(data) {
  return request("/api/miniprogram/tasks/update", {
    method: "POST",
    data
  });
}

function getTaskEditSuggestion(data) {
  return request("/api/miniprogram/ai/task/edit", {
    method: "POST",
    data
  });
}

function getProjectEditSuggestion(data) {
  return request("/api/miniprogram/ai/project/edit", {
    method: "POST",
    data
  });
}

function deleteTask(taskId) {
  return request("/api/miniprogram/tasks/delete", {
    method: "POST",
    data: { taskId }
  });
}

function getStickyNotes(taskId) {
  return request(`/api/miniprogram/tasks/sticky?taskId=${encodeURIComponent(taskId)}`);
}

function createStickyNote(taskId, message) {
  return request("/api/miniprogram/tasks/sticky", {
    method: "POST",
    data: { taskId, message }
  });
}

function deleteStickyNote(noteId) {
  return request("/api/miniprogram/tasks/sticky/delete", {
    method: "POST",
    data: { noteId }
  });
}

function updateProfile(data) {
  return request("/api/miniprogram/profile/update", {
    method: "POST",
    data
  });
}

function getExportData() {
  return request("/api/miniprogram/export");
}

module.exports = {
  request,
  getToken,
  setToken,
  clearToken,
  setCachedUser,
  getCachedUser,
  loginOrRegister,
  getOnboarding,
  setOnboardingStep,
  getMe,
  getToday,
  getTools,
  createInboxItem,
  clarifyIdea,
  planInbox,
  confirmPlan,
  ignoreInbox,
  setTaskStatus,
  generateReviewDraft,
  getReview,
  saveReview,
  sendReviewFeedback,
  getWorkspace,
  createProject,
  updateProject,
  deleteProject,
  createTask,
  getTaskDetail,
  updateTask,
  getTaskEditSuggestion,
  getProjectEditSuggestion,
  deleteTask,
  getStickyNotes,
  createStickyNote,
  deleteStickyNote,
  updateProfile,
  getExportData,
};
