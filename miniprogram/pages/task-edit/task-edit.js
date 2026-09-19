const PRIORITIES = ["low", "medium", "high", "urgent"];
const PRIORITY_LABELS = ["低", "中", "高", "紧急"];
const STATUSES = ["todo", "in_progress", "done", "cancelled"];
const STATUS_LABELS = ["待办", "进行中", "已完成", "已取消"];

Page({
  data: {
    taskId: "",
    title: "",
    shortTitle: "",
    notes: "",
    priority: "medium",
    priorityIndex: 1,
    status: "todo",
    statusIndex: 0,
    scheduledDate: "",
    dueDate: "",
    focusDate: "",
    projectId: "",
    projectIndex: 0,
    projectNames: ["未关联项目"],
    projectIds: [""],
    priorityLabels: PRIORITY_LABELS,
    statusLabels: STATUS_LABELS,
    stickyNotes: [],
    stickyMessage: "",
    aiIdea: "",
    aiSuggestion: null,
    aiLoading: false
  },

  onLoad(options) {
    this.setData({ taskId: options.id || "" });
    this.loadTask();
    this.loadStickyNotes();
  },

  loadTask() {
    const { getToken, getTaskDetail, getWorkspace } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }

    Promise.all([getTaskDetail(this.data.taskId), getWorkspace()])
      .then((results) => {
        const task = results[0].task;
        const projects = results[1].projects || [];
        const projectNames = ["未关联项目"].concat(projects.map((project) => project.name));
        const projectIds = [""].concat(projects.map((project) => project.id));
        const priorityIndex = Math.max(PRIORITIES.indexOf(task.priority), 0);
        const statusIndex = Math.max(STATUSES.indexOf(task.status), 0);
        const projectIndex = Math.max(projectIds.indexOf(task.projectId), 0);
        this.setData({
          title: task.title || "",
          shortTitle: task.shortTitle || "",
          notes: task.notes || "",
          priority: PRIORITIES[priorityIndex],
          priorityIndex,
          status: STATUSES[statusIndex],
          statusIndex,
          scheduledDate: task.scheduledDate || "",
          dueDate: task.dueDate || "",
          focusDate: task.focusDate || "",
          projectId: task.projectId || "",
          projectIndex,
          projectNames,
          projectIds
        });
      })
      .catch(() => wx.showToast({ title: "任务没加载出来", icon: "none" }));
  },

  loadStickyNotes() {
    const { getStickyNotes } = require("../../utils/api");
    getStickyNotes(this.data.taskId)
      .then((result) => this.setData({ stickyNotes: result.notes || [] }))
      .catch(() => {});
  },

  onTitleInput(event) { this.setData({ title: event.detail.value }); },
  onShortTitleInput(event) { this.setData({ shortTitle: event.detail.value }); },
  onNotesInput(event) { this.setData({ notes: event.detail.value }); },
  onPriorityChange(event) {
    const index = Number(event.detail.value);
    this.setData({ priorityIndex: index, priority: PRIORITIES[index] || "medium" });
  },
  onStatusChange(event) {
    const index = Number(event.detail.value);
    this.setData({ statusIndex: index, status: STATUSES[index] || "todo" });
  },
  onProjectChange(event) {
    const index = Number(event.detail.value);
    this.setData({ projectIndex: index, projectId: this.data.projectIds[index] || "" });
  },
  onScheduledChange(event) { this.setData({ scheduledDate: event.detail.value }); },
  onDueChange(event) { this.setData({ dueDate: event.detail.value }); },
  onFocusChange(event) { this.setData({ focusDate: event.detail.value }); },
  onStickyInput(event) { this.setData({ stickyMessage: event.detail.value }); },

  onGenerateSticky() {
    const { createStickyNote } = require("../../utils/api");
    wx.showLoading({ title: "正在写便利贴..." });
    createStickyNote(this.data.taskId, this.data.stickyMessage)
      .then(() => {
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
          .then(() => this.loadStickyNotes())
          .catch(() => wx.showToast({ title: "删除失败", icon: "none" }));
      }
    });
  },

  onAiIdeaInput(event) { this.setData({ aiIdea: event.detail.value }); },

  onAiTaskSuggest() {
    const idea = this.data.aiIdea.trim();
    if (!idea) {
      wx.showToast({ title: "先写下你想怎么改", icon: "none" });
      return;
    }
    if (this.data.aiLoading) return;
    const { getTaskEditSuggestion } = require("../../utils/api");
    this.setData({ aiLoading: true });
    wx.showLoading({ title: "正在判断怎么改..." });
    getTaskEditSuggestion({
      taskId: this.data.taskId,
      title: this.data.title,
      shortTitle: this.data.shortTitle,
      notes: this.data.notes,
      priority: this.data.priority,
      scheduledDate: this.data.scheduledDate,
      dueDate: this.data.dueDate,
      focusDate: this.data.focusDate,
      idea
    })
      .then((result) => {
        wx.hideLoading();
        this.setData({ aiLoading: false, aiSuggestion: result.suggestion });
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ aiLoading: false });
        wx.showToast({ title: "这次没整理出来", icon: "none" });
      });
  },

  onApplyAiSuggestion() {
    const suggestion = this.data.aiSuggestion;
    if (!suggestion) return;
    const nextPriority = suggestion.priority && PRIORITIES.includes(suggestion.priority)
      ? suggestion.priority
      : this.data.priority;
    const priorityIndex = Math.max(PRIORITIES.indexOf(nextPriority), 0);
    this.setData({
      title: suggestion.title || this.data.title,
      shortTitle: suggestion.shortTitle || this.data.shortTitle,
      notes: suggestion.notes === undefined ? this.data.notes : (suggestion.notes || ""),
      priority: nextPriority,
      priorityIndex,
      scheduledDate: suggestion.scheduledDate === undefined ? this.data.scheduledDate : (suggestion.scheduledDate || ""),
      dueDate: suggestion.dueDate === undefined ? this.data.dueDate : (suggestion.dueDate || ""),
      focusDate: suggestion.focusDate === undefined ? this.data.focusDate : (suggestion.focusDate || "")
    });
    wx.showToast({ title: "已应用建议", icon: "success" });
  },

  onSave() {
    const { updateTask } = require("../../utils/api");
    if (!this.data.title.trim()) {
      wx.showToast({ title: "先写任务内容", icon: "none" });
      return;
    }
    wx.showLoading({ title: "正在保存..." });
    updateTask({
      taskId: this.data.taskId,
      title: this.data.title,
      shortTitle: this.data.shortTitle,
      notes: this.data.notes,
      priority: this.data.priority,
      status: this.data.status,
      scheduledDate: this.data.scheduledDate,
      dueDate: this.data.dueDate,
      focusDate: this.data.focusDate,
      projectId: this.data.projectId
    })
      .then(() => {
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
