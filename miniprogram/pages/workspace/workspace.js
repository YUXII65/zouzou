const STATUS_LABELS = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消"
};

const PRIORITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急"
};

const PROJECT_STATUSES = ["active", "paused", "completed", "archived"];
const PROJECT_STATUS_LABELS = ["进行中", "已暂停", "已完成", "已归档"];

function decorateTasks(tasks) {
  return (tasks || []).map((task) => ({
    ...task,
    displayTitle: task.shortTitle || task.title,
    statusLabel: STATUS_LABELS[task.status] || task.status,
    priorityLabel: PRIORITY_LABELS[task.priority] || task.priority,
    actionLabel: task.status === "todo"
      ? "下一步"
      : task.status === "in_progress"
        ? "完成"
        : "重新开始",
    nextStatus: task.status === "todo"
      ? "in_progress"
      : task.status === "in_progress"
        ? "done"
        : "todo"
  }));
}

Page({
  data: {
    userAvatar: "",
    userInitial: "走",
    projects: [],
    unassociatedTasks: [],
    activeProjectId: "",
    activeProject: null,
    showUnassigned: false,
    visibleTasks: [],
    showCreateProject: false,
    projectName: "",
    projectObjective: "",
    projectMilestone: "",
    projectStatusIndex: 0,
    projectStatusLabels: PROJECT_STATUS_LABELS,
    showEditProject: false,
    editProjectName: "",
    editProjectObjective: "",
    editProjectMilestone: "",
    editProjectStatusIndex: 0,
    showCreateTask: false,
    taskTitle: "",
    taskNotes: "",
    taskShortTitle: "",
    taskPriorityIndex: 1,
    taskStatusIndex: 0,
    taskScheduledDate: "",
    taskDueDate: "",
    taskFocusDate: "",
    priorityLabels: ["低", "中", "高", "紧急"],
    statusLabels: ["待办", "进行中", "已完成", "已取消"]
  },

  syncUserHeader() {
    const { getCachedUser } = require("../../utils/api");
    const user = getCachedUser();
    const displayName = user ? (user.displayName || user.username || "走") : "走";
    this.setData({
      userAvatar: user && user.avatarUrl ? user.avatarUrl : "",
      userInitial: displayName.slice(0, 1)
    });
  },
  onShow() {
    this.loadWorkspace();
    this.syncUserHeader();
  },

  loadWorkspace() {
    const { getToken, getWorkspace } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }

    getWorkspace()
      .then((result) => {
        const projects = result.projects || [];
        const unassociatedTasks = result.unassociatedTasks || [];
        const keepUnassigned = this.data.showUnassigned && unassociatedTasks.length > 0;
        const currentIdExists = projects.some((project) => project.id === this.data.activeProjectId);
        const activeProjectId = keepUnassigned
          ? ""
          : currentIdExists
            ? this.data.activeProjectId
            : (projects[0] && projects[0].id) || "";
        const showUnassigned = keepUnassigned || (!projects.length && unassociatedTasks.length > 0);
        this.applyWorkspace(projects, unassociatedTasks, activeProjectId, showUnassigned);
      })
      .catch((error) => {
        if (error.statusCode === 401) {
          wx.reLaunch({ url: "/pages/login/login" });
          return;
        }
        wx.showToast({ title: "书桌没加载出来", icon: "none" });
      });
  },

  applyWorkspace(projects, unassociatedTasks, activeProjectId, showUnassigned) {
    const normalizedProjects = projects.map((project) => ({
      ...project,
      statusLabel: PROJECT_STATUS_LABELS[PROJECT_STATUSES.indexOf(project.status)] || project.status
    }));
    const activeProject = normalizedProjects.find((project) => project.id === activeProjectId) || null;
    const normalizedProject = activeProject
      ? { ...activeProject, tasks: decorateTasks(activeProject.tasks) }
      : null;
    const normalizedUnassociated = decorateTasks(unassociatedTasks);

    this.setData({
      projects,
      unassociatedTasks: normalizedUnassociated,
      activeProjectId: showUnassigned ? "" : activeProject ? activeProject.id : "",
      activeProject: showUnassigned ? null : normalizedProject,
      showUnassigned: Boolean(showUnassigned),
      visibleTasks: showUnassigned
        ? normalizedUnassociated
        : normalizedProject
          ? normalizedProject.tasks
          : []
    });
  },

  onProjectTap(event) {
    const id = event.currentTarget.dataset.id;
    const activeProject = this.data.projects.find((project) => project.id === id) || null;
    this.setData({
      showUnassigned: false,
      activeProjectId: id,
      activeProject: activeProject ? { ...activeProject, tasks: decorateTasks(activeProject.tasks) } : null,
      showCreateTask: false,
      showEditProject: false
    }, () => {
      this.setData({ visibleTasks: this.data.activeProject ? this.data.activeProject.tasks : [] });
    });
  },

  onUnassignedTap() {
    this.setData({
      showUnassigned: true,
      activeProjectId: "",
      activeProject: null,
      showCreateTask: false,
      showEditProject: false,
      visibleTasks: this.data.unassociatedTasks
    });
  },

  onToggleCreateProject() {
    this.setData({ showCreateProject: !this.data.showCreateProject });
  },

  onProjectNameInput(event) { this.setData({ projectName: event.detail.value }); },
  onProjectObjectiveInput(event) { this.setData({ projectObjective: event.detail.value }); },
  onProjectMilestoneInput(event) { this.setData({ projectMilestone: event.detail.value }); },
  onProjectStatusChange(event) { this.setData({ projectStatusIndex: Number(event.detail.value) }); },

  onCreateProject() {
    const { createProject } = require("../../utils/api");
    if (!this.data.projectName.trim() || !this.data.projectObjective.trim()) {
      wx.showToast({ title: "项目名称和目标要写清楚", icon: "none" });
      return;
    }
    wx.showLoading({ title: "正在创建..." });
    createProject({
      name: this.data.projectName,
      objective: this.data.projectObjective,
      currentMilestone: this.data.projectMilestone,
      status: PROJECT_STATUSES[this.data.projectStatusIndex] || "active"
    }).then((result) => {
      wx.hideLoading();
      this.setData({
        showCreateProject: false,
        projectName: "",
        projectObjective: "",
        projectMilestone: "",
        projectStatusIndex: 0,
        activeProjectId: result.project.id,
        showUnassigned: false
      });
      this.loadWorkspace();
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: "项目没创建成功", icon: "none" });
    });
  },

  onToggleEditProject() {
    const project = this.data.activeProject;
    if (!project || this.data.showUnassigned) return;
    this.setData({
      showEditProject: !this.data.showEditProject,
      editProjectName: project.name,
      editProjectObjective: project.objective,
      editProjectMilestone: project.currentMilestone || "",
      editProjectStatusIndex: Math.max(PROJECT_STATUSES.indexOf(project.status), 0)
    });
  },

  onEditProjectNameInput(event) { this.setData({ editProjectName: event.detail.value }); },
  onEditProjectObjectiveInput(event) { this.setData({ editProjectObjective: event.detail.value }); },
  onEditProjectMilestoneInput(event) { this.setData({ editProjectMilestone: event.detail.value }); },
  onEditProjectStatusChange(event) { this.setData({ editProjectStatusIndex: Number(event.detail.value) }); },

  onSaveProject() {
    const { updateProject } = require("../../utils/api");
    if (this.data.showUnassigned || !this.data.activeProject) return;
    if (!this.data.editProjectName.trim() || !this.data.editProjectObjective.trim()) {
      wx.showToast({ title: "项目名称和目标要写清楚", icon: "none" });
      return;
    }
    wx.showLoading({ title: "正在保存..." });
    updateProject({
      projectId: this.data.activeProjectId,
      name: this.data.editProjectName,
      objective: this.data.editProjectObjective,
      currentMilestone: this.data.editProjectMilestone,
      status: PROJECT_STATUSES[this.data.editProjectStatusIndex] || this.data.activeProject.status
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: "已保存", icon: "success" });
      this.setData({ showEditProject: false });
      this.loadWorkspace();
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: "保存失败", icon: "none" });
    });
  },

  onDeleteProject() {
    const { deleteProject } = require("../../utils/api");
    if (this.data.showUnassigned || !this.data.activeProjectId) return;
    wx.showModal({
      title: "删除项目",
      content: "项目下的任务会保留并解除关联。确定删除？",
      success: (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: "正在删除..." });
        deleteProject(this.data.activeProjectId).then(() => {
          wx.hideLoading();
          wx.showToast({ title: "已删除", icon: "success" });
          this.setData({ activeProjectId: "", activeProject: null, showEditProject: false });
          this.loadWorkspace();
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: "删除失败", icon: "none" });
        });
      }
    });
  },

  onToggleCreateTask() {
    this.setData({ showCreateTask: !this.data.showCreateTask });
  },

  onTaskTitleInput(event) { this.setData({ taskTitle: event.detail.value }); },
  onTaskShortTitleInput(event) { this.setData({ taskShortTitle: event.detail.value }); },
  onTaskNotesInput(event) { this.setData({ taskNotes: event.detail.value }); },
  onTaskPriorityChange(event) { this.setData({ taskPriorityIndex: Number(event.detail.value) }); },
  onTaskStatusChange(event) { this.setData({ taskStatusIndex: Number(event.detail.value) }); },
  onTaskScheduledChange(event) { this.setData({ taskScheduledDate: event.detail.value }); },
  onTaskDueChange(event) { this.setData({ taskDueDate: event.detail.value }); },
  onTaskFocusChange(event) { this.setData({ taskFocusDate: event.detail.value }); },

  onCreateTask() {
    const { createTask } = require("../../utils/api");
    if (!this.data.taskTitle.trim()) {
      wx.showToast({ title: "先写任务标题", icon: "none" });
      return;
    }
    if (!this.data.showUnassigned && !this.data.activeProjectId) {
      wx.showToast({ title: "先选择项目或未关联任务", icon: "none" });
      return;
    }
    wx.showLoading({ title: "正在添加..." });
    createTask({
      title: this.data.taskTitle,
      shortTitle: this.data.taskShortTitle,
      notes: this.data.taskNotes,
      projectId: this.data.showUnassigned ? "" : this.data.activeProjectId,
      priority: ["low", "medium", "high", "urgent"][this.data.taskPriorityIndex] || "medium",
      status: ["todo", "in_progress", "done", "cancelled"][this.data.taskStatusIndex] || "todo",
      scheduledDate: this.data.taskScheduledDate,
      dueDate: this.data.taskDueDate,
      focusDate: this.data.taskFocusDate
    }).then(() => {
      wx.hideLoading();
      this.setData({ showCreateTask: false, taskTitle: "", taskShortTitle: "", taskNotes: "", taskPriorityIndex: 1, taskStatusIndex: 0, taskScheduledDate: "", taskDueDate: "", taskFocusDate: "" });
      this.loadWorkspace();
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: "任务没添加成功", icon: "none" });
    });
  },
  onTaskStatusTap(event) {
    const taskId = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    if (!taskId || !status) return;
    const { setTaskStatus } = require("../../utils/api");
    wx.showLoading({ title: "正在同步..." });
    setTaskStatus(taskId, status).then(() => {
      wx.hideLoading();
      this.loadWorkspace();
    }).catch((error) => {
      wx.hideLoading();
      if (error.statusCode === 401) {
        wx.reLaunch({ url: "/pages/login/login" });
        return;
      }
      wx.showToast({ title: "状态没更新成功", icon: "none" });
    });
  },

  onTaskEditTap(event) {
    const taskId = event.currentTarget.dataset.id;
    if (!taskId) return;
    wx.navigateTo({ url: `/pages/task-edit/task-edit?id=${encodeURIComponent(taskId)}` });
  },

  onProfileTap() { wx.navigateTo({ url: "/pages/profile/profile" }); },
  onToolsTap() { wx.reLaunch({ url: "/pages/tools/tools" }); },
  onTabTap(event) {
    const key = event.currentTarget.dataset.key;
    const routes = { today: "/pages/today/today", desk: "/pages/workspace/workspace", review: "/pages/review/review" };
    if (key === "desk" || !routes[key]) return;
    wx.reLaunch({ url: routes[key] });
  }
});
