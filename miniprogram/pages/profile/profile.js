const { syncTabBar } = require("../../utils/tab-bar");
const { markDataChanged, shouldRefresh } = require("../../utils/data-refresh");

const AVATAR_PIXELS = 192;
const MAX_AVATAR_CHARS = 400000;

const EMPTY_COUNTS = { checkin: 0, normal: 0, longterm: 0, explore: 0 };

function initialCheckinItems() {
  return [1, 2, 3].map((label) => ({
    taskId: null,
    label,
    value: "",
    added: false
  }));
}

const { getContentTop } = require("../../utils/layout");

Page({
  data: {
    theme: "light",
    contentTop: 92,
    username: "",
    displayName: "",
    avatarUrl: "",
    displayInitial: "走",
    counts: EMPTY_COUNTS,
    checkin: null,
    checkinDialog: false,
    checkinDialogMode: "create",
    checkinItems: initialCheckinItems(),
    checkinSaving: false,
    serverConnected: false,
    editingName: false,
    saving: false
  },

  onShow() {
    this.setData({ contentTop: getContentTop() });
    const theme = this.syncTheme();
    syncTabBar(this, "profile", theme);
    if (this._loading || this.data.editingName || this.data.saving) return;
    if (!shouldRefresh("profile", this._lastLoadAt)) return;
    this.loadProfile();
  },

  syncTheme() {
    const { getTheme } = require("../../utils/theme");
    const theme = getTheme();
    if (theme !== this.data.theme) this.setData({ theme });
    return theme;
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
          checkin: result.checkin || null,
          serverConnected: Boolean(result.serverConnected)
        });
        this._lastLoadAt = Date.now();
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
        markDataChanged(["today", "workspace", "profile"]);
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
    const theme = toggleTheme();
    this.setData({ theme });
    syncTabBar(this, "profile", theme);
  },

  onCheckinModeTap() {
    if (this.data.checkin) {
      this.setData({
        checkinDialog: true,
        checkinDialogMode: "edit",
        checkinItems: (this.data.checkin.items || []).map((item, index) => ({
          taskId: item.id,
          label: index + 1,
          value: item.title,
          added: false
        }))
      });
      return;
    }
    this.setData({
      checkinDialog: true,
      checkinDialogMode: "create",
      checkinItems: initialCheckinItems()
    });
  },

  onCheckinInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.setData({
      [`checkinItems[${index}].value`]: event.detail.value
    });
  },

  onAddCheckinItem() {
    if (this.data.checkinItems.length >= 30) return;
    this.setData({
      checkinItems: [
        ...this.data.checkinItems,
        { taskId: null, label: null, value: "", added: true }
      ]
    });
  },

  onRemoveCheckinItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.setData({
      checkinItems: this.data.checkinItems.filter(
        (_, itemIndex) => itemIndex !== index
      )
    });
  },

  onCheckinClose() {
    if (this.data.checkinSaving) return;
    this.setData({
      checkinDialog: false,
      checkinDialogMode: "create",
      checkinItems: initialCheckinItems()
    });
  },

  stopPropagation() {},

  onCheckinConfirm() {
    const draftItems = (this.data.checkinItems || [])
      .map((item) => ({
        id: item.taskId || null,
        title: String(item.value || "").trim()
      }))
      .filter((item) => item.title);
    if (!draftItems.length || this.data.checkinSaving) {
      if (!draftItems.length) wx.showToast({ title: "先填写每日待办", icon: "none" });
      return;
    }
    const editing = this.data.checkinDialogMode === "edit";
    const { createCheckin, updateCheckinItems } = require("../../utils/api");
    this.setData({ checkinSaving: true });
    const action = editing
      ? updateCheckinItems(this.data.checkin.projectId, draftItems)
      : createCheckin(draftItems.map((item) => item.title).join("\n"));
    action
      .then((result) => {
        if (!result || !result.ok) {
          throw new Error((result && result.error) || "create_failed");
        }
        markDataChanged(["today", "workspace", "profile"]);
        this.setData({
          checkinDialog: false,
          checkinDialogMode: "create",
          checkinItems: initialCheckinItems()
        });
        this.loadProfile();
        wx.showToast({
          title: editing ? "打卡内容已更新" : "打卡已开启",
          icon: "success"
        });
      })
      .catch((error) => {
        wx.showToast({
          title: (error && error.message) || "没保存成功，再试一次",
          icon: "none"
        });
      })
      .then(() => this.setData({ checkinSaving: false }));
  },

  onCheckinRemoveFromEdit() {
    if (this.data.checkinSaving) return;
    this.setData({
      checkinDialog: false,
      checkinDialogMode: "create",
      checkinItems: initialCheckinItems()
    });
    this.onRemoveCheckinMode();
  },

  onRemoveCheckinMode() {
    if (!this.data.checkin || this.data.checkinSaving) return;
    wx.showModal({
      title: "取消打卡模式",
      content: "打卡条目和每日完成记录会一起删除，之后可以重新开启。",
      confirmColor: "#d95050",
      success: (result) => {
        if (!result.confirm) return;
        const { deleteCheckin } = require("../../utils/api");
        this.setData({ checkinSaving: true });
        deleteCheckin(this.data.checkin.projectId)
          .then((response) => {
            if (!response || !response.ok) throw new Error("delete_failed");
            markDataChanged(["today", "workspace", "profile"]);
            this.setData({ checkin: null });
            this.loadProfile();
            wx.showToast({ title: "已取消打卡", icon: "success" });
          })
          .catch(() => {
            wx.showToast({ title: "没取消成功，再试一次", icon: "none" });
          })
          .then(() => this.setData({ checkinSaving: false }));
      }
    });
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
