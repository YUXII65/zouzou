const { markDataChanged } = require("../../utils/data-refresh");
const { normalizeStickySteps } = require("../../utils/sticky");

const PRIORITIES = ["low", "medium", "high", "urgent"];
const PRIORITY_LABELS = ["低", "中", "高", "紧急"];

Page({
  data: {
    taskId: "",
    title: "",
    notes: "",
    methodHint: "",
    doneWhen: "",
    executionMode: "quick",
    executionModeIndex: 0,
    executionModeValues: ["quick", "tool", "produce", "explore", "project"],
    executionModeLabels: ["直接完成", "查资料", "做产物", "做验证", "长期推进"],
    priority: "medium",
    priorityIndex: 1,
    dueDate: "",
    status: "todo",
    projectId: "",
    scheduledDate: "",
    focusDate: "",
    priorityLabels: PRIORITY_LABELS,
    stickyNotes: [],
    stickyMessage: "",
    showSticky: false
  },

  onLoad(options) {
    this.setData({ taskId: options.id || "", showSticky: options.focus === "sticky" });
    this.loadTask();
    this.loadStickyNotes();
  },

  loadTask() {
    const { getToken, getTaskDetail } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    getTaskDetail(this.data.taskId)
      .then((result) => {
        const task = result.task;
        const priorityIndex = Math.max(PRIORITIES.indexOf(task.priority), 0);
        this.setData({
          title: task.title || "",
          notes: task.notes || "",
          methodHint: task.methodHint || "",
          doneWhen: task.doneWhen || "",
          executionMode: task.executionMode || "quick",
          executionModeIndex: Math.max(this.data.executionModeValues.indexOf(task.executionMode || "quick"), 0),
          priority: PRIORITIES[priorityIndex],
          priorityIndex,
          dueDate: task.dueDate || "",
          status: task.status || "todo",
          projectId: task.projectId || "",
          scheduledDate: task.scheduledDate || "",
          focusDate: task.focusDate || ""
        });
      })
      .catch(() => wx.showToast({ title: "任务没加载出来", icon: "none" }));
  },

  loadStickyNotes() {
    const { getStickyNotes } = require("../../utils/api");
    getStickyNotes(this.data.taskId)
      .then((result) => this.setData({
        stickyNotes: (result.notes || []).map((note) => ({
          ...note,
          steps: normalizeStickySteps(note),
        })),
      }))
      .catch(() => {});
  },

  onTitleInput(event) { this.setData({ title: event.detail.value }); },
  onNotesInput(event) { this.setData({ notes: event.detail.value }); },
  onMethodInput(event) { this.setData({ methodHint: event.detail.value }); },
  onExecutionChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      executionModeIndex: index,
      executionMode: this.data.executionModeValues[index] || "quick",
    });
  },
  onDoneWhenInput(event) { this.setData({ doneWhen: event.detail.value }); },
  onPriorityChange(event) {
    const index = Number(event.detail.value);
    this.setData({ priorityIndex: index, priority: PRIORITIES[index] || "medium" });
  },
  onDueChange(event) { this.setData({ dueDate: event.detail.value }); },
  onToggleSticky() { this.setData({ showSticky: !this.data.showSticky }); },

  onStickyInput(event) { this.setData({ stickyMessage: event.detail.value }); },

  onGenerateSticky() {
    const { createStickyNote } = require("../../utils/api");
    wx.showLoading({ title: "正在写便利贴..." });
    createStickyNote(this.data.taskId, this.data.stickyMessage)
      .then(() => {
        markDataChanged(["today", "workspace"]);
        wx.hideLoading();
        this.setData({ stickyMessage: "" });
        this.loadStickyNotes();
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "便利贴没生成成功", icon: "none" });
      });
  },

  onDeleteSticky(event) {
    const { deleteStickyNote } = require("../../utils/api");
    const noteId = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除便利贴",
      content: "确定删除这张便利贴？",
      success: (result) => {
        if (!result.confirm) return;
        deleteStickyNote(noteId)
          .then(() => {
            markDataChanged(["today", "workspace"]);
            this.loadStickyNotes();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "none" }));
      }
    });
  },

  onSave() {
    const { updateTask } = require("../../utils/api");
    if (!this.data.title.trim()) {
      wx.showToast({ title: "先写标题", icon: "none" });
      return;
    }
    wx.showLoading({ title: "正在保存..." });
    updateTask({
      taskId: this.data.taskId,
      title: this.data.title,
      notes: this.data.notes,
      methodHint: this.data.methodHint,
      doneWhen: this.data.doneWhen,
      executionMode: this.data.executionMode,
      priority: this.data.priority,
      dueDate: this.data.dueDate,
      status: this.data.status,
      projectId: this.data.projectId,
      scheduledDate: this.data.scheduledDate,
      focusDate: this.data.focusDate
    })
      .then(() => {
        markDataChanged(["today", "workspace", "profile"]);
        wx.hideLoading();
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 400);
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "保存失败", icon: "none" });
      });
  },

  onDelete() {
    const { deleteTask } = require("../../utils/api");
    wx.showModal({
      title: "删除任务",
      content: "确定删除这个任务？",
      success: (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: "正在删除..." });
        deleteTask(this.data.taskId)
          .then(() => {
            markDataChanged(["today", "workspace", "profile"]);
            wx.hideLoading();
            wx.showToast({ title: "已删除", icon: "success" });
            setTimeout(() => wx.navigateBack(), 400);
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: "删除失败", icon: "none" });
          });
      }
    });
  }
});
