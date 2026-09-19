const AVATAR_PIXELS = 192;
const MAX_AVATAR_CHARS = 400000;

Page({
  data: {
    username: "",
    displayName: "",
    avatarUrl: "",
    saving: false
  },

  onLoad() { this.loadProfile(); },

  loadProfile() {
    const { getToken, getMe } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    getMe()
      .then((result) => {
        const user = result.user;
        this.setData({
          username: user.username || "",
          displayName: user.displayName || user.username || "",
          avatarUrl: user.avatarUrl || ""
        });
      })
      .catch(() => wx.showToast({ title: "资料没加载出来", icon: "none" }));
  },

  onNameInput(event) { this.setData({ displayName: event.detail.value }); },

  onChooseAvatar() {
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
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "头像读取失败", icon: "none" });
      }
    });
  },

  onResetAvatar() { this.setData({ avatarUrl: "" }); },

  onSave() {
    if (this.data.saving) return;
    const { updateProfile, setCachedUser } = require("../../utils/api");
    this.setData({ saving: true });
    wx.showLoading({ title: "正在保存..." });
    updateProfile({
      displayName: this.data.displayName.trim(),
      avatarUrl: this.data.avatarUrl
    })
      .then(() => {
        wx.hideLoading();
        setCachedUser({
          username: this.data.username,
          displayName: this.data.displayName.trim(),
          avatarUrl: this.data.avatarUrl
        });
        this.setData({ saving: false });
        wx.showToast({ title: "已保存", icon: "success" });
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ saving: false });
        wx.showToast({ title: "保存失败", icon: "none" });
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
