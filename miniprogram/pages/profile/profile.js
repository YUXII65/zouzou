const AVATAR_PIXELS = 192;
const MAX_AVATAR_CHARS = 400000;

const EMPTY_COUNTS = { normal: 0, longterm: 0, explore: 0 };

Page({
  data: {
    theme: "light",
    username: "",
    displayName: "",
    avatarUrl: "",
    displayInitial: "走",
    counts: EMPTY_COUNTS,
    serverConnected: false,
    editingName: false,
    saving: false
  },

  onShow() {
    this.syncTheme();
    if (this._loading || this.data.editingName || this.data.saving) return;
    this.loadProfile();
  },

  syncTheme() {
    const { getTheme } = require("../../utils/theme");
    this.setData({ theme: getTheme() });
  },

  loadProfile() {
    const { getToken, getProfile, setCachedUser } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return Promise.resolve();
    }

    this._loading = true;
    return getProfile()
      .then((result) => {
        const user = result.user || {};
        const displayName = user.displayName || user.username || "走";
        setCachedUser(user);
        this.setData({
          username: user.username || "",
          displayName,
          avatarUrl: user.avatarUrl || "",
          displayInitial: displayName.slice(0, 1),
          counts: result.counts || EMPTY_COUNTS,
          serverConnected: Boolean(result.serverConnected)
        });
      })
      .catch((error) => {
        if (error && error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "资料没加载出来", icon: "none" });
      })
      .then(() => {
        this._loading = false;
      });
  },

  onEditName() {
    this.setData({ editingName: true });
  },

  onCancelEditName() {
    const { getCachedUser } = require("../../utils/api");
    const user = getCachedUser() || {};
    const displayName = user.displayName || user.username || "走";
    this.setData({
      displayName,
      displayInitial: displayName.slice(0, 1),
      editingName: false
    });
  },

  onNameInput(event) {
    const displayName = event.detail.value;
    this.setData({
      displayName,
      displayInitial: (displayName || this.data.username || "走").slice(0, 1)
    });
  },

  onSaveName() {
    this.saveProfile({ closeEditing: true });
  },

  saveProfile(options = {}) {
    if (this.data.saving) return Promise.resolve();
    const { updateProfile, setCachedUser } = require("../../utils/api");
    const displayName = (this.data.displayName || "").trim() || this.data.username || "走";
    const avatarUrl = this.data.avatarUrl || "";
    this.setData({ saving: true });

    return updateProfile({ displayName, avatarUrl })
      .then(() => {
        setCachedUser({
          username: this.data.username,
          displayName,
          avatarUrl
        });
        this.setData({
          displayName,
          displayInitial: displayName.slice(0, 1),
          editingName: options.closeEditing ? false : this.data.editingName
        });
        wx.showToast({ title: "已保存", icon: "success" });
      })
      .catch(() => {
        wx.showToast({ title: "保存失败", icon: "none" });
      })
      .then(() => {
        this.setData({ saving: false });
      });
  },

  onChooseAvatar() {
    if (this.data.saving) return;
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (result) => this.prepareAvatar(result.tempFilePaths[0])
    });
  },

  prepareAvatar(path) {
    if (!path) return;
    wx.showLoading({ title: "正在处理头像..." });
    const query = wx.createSelectorQuery();
    query.select("#avatar-canvas").fields({ node: true, size: true }).exec((result) => {
      const canvas = result && result[0] && result[0].node;
      if (!canvas) {
        this.fallbackCompressAvatar(path);
        return;
      }
      const context = canvas.getContext("2d");
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const pixelRatio = windowInfo.pixelRatio || 1;
      canvas.width = AVATAR_PIXELS * pixelRatio;
      canvas.height = AVATAR_PIXELS * pixelRatio;
      context.scale(pixelRatio, pixelRatio);
      const image = canvas.createImage();
      image.onload = () => {
        const scale = Math.max(AVATAR_PIXELS / image.width, AVATAR_PIXELS / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(
          image,
          (AVATAR_PIXELS - width) / 2,
          (AVATAR_PIXELS - height) / 2,
          width,
          height
        );
        wx.canvasToTempFilePath({
          canvas,
          fileType: "jpg",
          quality: 0.85,
          destWidth: AVATAR_PIXELS * pixelRatio,
          destHeight: AVATAR_PIXELS * pixelRatio,
          success: (file) => this.readAvatarFile(file.tempFilePath),
          fail: () => this.fallbackCompressAvatar(path)
        }, this);
      };
      image.onerror = () => this.fallbackCompressAvatar(path);
      image.src = path;
    });
  },

  fallbackCompressAvatar(path) {
    wx.compressImage({
      src: path,
      quality: 70,
      success: (result) => this.readAvatarFile(result.tempFilePath),
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "这张图片处理不了", icon: "none" });
      }
    });
  },

  readAvatarFile(path) {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success: (file) => {
        const avatarUrl = `data:image/jpeg;base64,${file.data}`;
        wx.hideLoading();
        if (avatarUrl.length > MAX_AVATAR_CHARS) {
          wx.showToast({ title: "图片太大了，换一张小一点的", icon: "none" });
          return;
        }
        this.setData({ avatarUrl });
        this.saveProfile({ closeEditing: false });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "头像读取失败", icon: "none" });
      }
    });
  },

  onThemeTap() {
    const { toggleTheme } = require("../../utils/theme");
    this.setData({ theme: toggleTheme() });
  },

  onApiSettings() {
    wx.showModal({
      title: "API 连接",
      content: this.data.serverConnected
        ? "服务端已连接，小程序无需在本机配置 Key。"
        : "当前使用本地规则。请到网页版个人页检查 API 连接。",
      showCancel: false,
      confirmText: "知道了"
    });
  },

  onLogout() {
    const { clearToken } = require("../../utils/api");
    wx.showModal({
      title: "退出登录",
      content: "退出不会删除你的项目、任务和复盘。",
      success: (result) => {
        if (!result.confirm) return;
        clearToken();
        wx.reLaunch({ url: "/pages/index/index" });
      }
    });
  }
});
