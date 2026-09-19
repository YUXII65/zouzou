Page({
  data: { taskId: "", title: "", notes: "", priority: "medium", scheduledDate: "", dueDate: "", projectName: "", stickyNotes: [], stickyMessage: "" },
  onLoad(options) { this.setData({ taskId: options.id || "" }); this.loadTask(); this.loadStickyNotes(); },
  loadTask() {
    const { getToken, getTaskDetail } = require("../../utils/api");
    if (!getToken()) { wx.reLaunch({ url: "/pages/login/login" }); return; }
    getTaskDetail(this.data.taskId).then((result) => { const task = result.task; this.setData({ title: task.title || "", notes: task.notes || "", priority: task.priority || "medium", scheduledDate: task.scheduledDate || "", dueDate: task.dueDate || "", projectName: task.projectName || "" }); }).catch(() => wx.showToast({ title: "任务没加载出来", icon: "none" }));
  },
  loadStickyNotes() { const { getStickyNotes } = require("../../utils/api"); getStickyNotes(this.data.taskId).then((result) => this.setData({ stickyNotes: result.notes || [] })).catch(() => {}); },
  onTitleInput(event) { this.setData({ title: event.detail.value }); },
  onNotesInput(event) { this.setData({ notes: event.detail.value }); },
  onPriorityChange(event) { this.setData({ priority: ["low", "medium", "high", "urgent"][Number(event.detail.value)] }); },
  onScheduledChange(event) { this.setData({ scheduledDate: event.detail.value }); },
  onDueChange(event) { this.setData({ dueDate: event.detail.value }); },
  onStickyInput(event) { this.setData({ stickyMessage: event.detail.value }); },
  onGenerateSticky() {
    const { createStickyNote } = require("../../utils/api");
    wx.showLoading({ title: "正在写便利贴..." });
    createStickyNote(this.data.taskId, this.data.stickyMessage).then(() => { wx.hideLoading(); this.setData({ stickyMessage: "" }); this.loadStickyNotes(); }).catch(() => { wx.hideLoading(); wx.showToast({ title: "便利贴没生成成功", icon: "none" }); });
  },
  onDeleteSticky(event) {
    const { deleteStickyNote } = require("../../utils/api");
    const noteId = event.currentTarget.dataset.id;
    wx.showModal({ title: "删除便利贴", content: "确定删除这张便利贴？", success: (result) => { if (!result.confirm) return; deleteStickyNote(noteId).then(() => this.loadStickyNotes()).catch(() => wx.showToast({ title: "删除失败", icon: "none" })); } });
  },
  onSave() {
    const { updateTask } = require("../../utils/api");
    if (!this.data.title.trim()) { wx.showToast({ title: "先写任务标题", icon: "none" }); return; }
    wx.showLoading({ title: "正在保存..." });
    updateTask({ taskId: this.data.taskId, title: this.data.title, notes: this.data.notes, priority: this.data.priority, scheduledDate: this.data.scheduledDate, dueDate: this.data.dueDate }).then(() => { wx.hideLoading(); wx.showToast({ title: "已保存", icon: "success" }); setTimeout(() => wx.navigateBack(), 400); }).catch(() => { wx.hideLoading(); wx.showToast({ title: "保存失败", icon: "none" }); });
  },
  onDelete() {
    const { deleteTask } = require("../../utils/api");
    wx.showModal({ title: "删除任务", content: "确定删除这个任务？", success: (result) => { if (!result.confirm) return; wx.showLoading({ title: "正在删除..." }); deleteTask(this.data.taskId).then(() => { wx.hideLoading(); wx.showToast({ title: "已删除", icon: "success" }); setTimeout(() => wx.navigateBack(), 400); }).catch(() => { wx.hideLoading(); wx.showToast({ title: "删除失败", icon: "none" }); }); } });
  }
});