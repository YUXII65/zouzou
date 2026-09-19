Page({
  data: {
    projects: [], unassociatedTasks: [], activeProjectId: "", activeProject: null,
    showCreateProject: false, projectName: "", projectObjective: "", projectMilestone: "",
    showEditProject: false, editProjectName: "", editProjectObjective: "", editProjectMilestone: "",
    showCreateTask: false, taskTitle: "", taskNotes: ""
  },
  onShow() { this.loadWorkspace(); },
  loadWorkspace() {
    const { getToken, getWorkspace } = require("../../utils/api");
    if (!getToken()) { wx.reLaunch({ url: "/pages/login/login" }); return; }
    getWorkspace().then((result) => {
      const projects = result.projects || [];
      const activeProjectId = this.data.activeProjectId || (projects[0] && projects[0].id) || "";
      const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0] || null;
      this.setData({ projects, unassociatedTasks: result.unassociatedTasks || [], activeProjectId: activeProject ? activeProject.id : "", activeProject });
    }).catch((error) => {
      if (error.statusCode === 401) { wx.reLaunch({ url: "/pages/login/login" }); return; }
      wx.showToast({ title: "书桌没加载出来", icon: "none" });
    });
  },
  onProjectTap(event) { const id = event.currentTarget.dataset.id; const activeProject = this.data.projects.find((project) => project.id === id) || null; this.setData({ activeProjectId: id, activeProject, showCreateTask: false, showEditProject: false }); },
  onToggleCreateProject() { this.setData({ showCreateProject: !this.data.showCreateProject }); },
  onProjectNameInput(event) { this.setData({ projectName: event.detail.value }); },
  onProjectObjectiveInput(event) { this.setData({ projectObjective: event.detail.value }); },
  onProjectMilestoneInput(event) { this.setData({ projectMilestone: event.detail.value }); },
  onCreateProject() {
    const { createProject } = require("../../utils/api");
    if (!this.data.projectName.trim() || !this.data.projectObjective.trim()) { wx.showToast({ title: "项目名称和目标要写清楚", icon: "none" }); return; }
    wx.showLoading({ title: "正在创建..." });
    createProject({ name: this.data.projectName, objective: this.data.projectObjective, currentMilestone: this.data.projectMilestone }).then((result) => {
      wx.hideLoading(); this.setData({ showCreateProject: false, projectName: "", projectObjective: "", projectMilestone: "", activeProjectId: result.project.id }); this.loadWorkspace();
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: "项目没创建成功", icon: "none" }); });
  },
  onToggleEditProject() { const project = this.data.activeProject; if (!project) return; this.setData({ showEditProject: !this.data.showEditProject, editProjectName: project.name, editProjectObjective: project.objective, editProjectMilestone: project.currentMilestone || "" }); },
  onEditProjectNameInput(event) { this.setData({ editProjectName: event.detail.value }); },
  onEditProjectObjectiveInput(event) { this.setData({ editProjectObjective: event.detail.value }); },
  onEditProjectMilestoneInput(event) { this.setData({ editProjectMilestone: event.detail.value }); },
  onSaveProject() {
    const { updateProject } = require("../../utils/api");
    if (!this.data.editProjectName.trim() || !this.data.editProjectObjective.trim()) { wx.showToast({ title: "项目名称和目标要写清楚", icon: "none" }); return; }
    wx.showLoading({ title: "正在保存..." });
    updateProject({ projectId: this.data.activeProjectId, name: this.data.editProjectName, objective: this.data.editProjectObjective, currentMilestone: this.data.editProjectMilestone, status: this.data.activeProject.status }).then(() => {
      wx.hideLoading(); wx.showToast({ title: "已保存", icon: "success" }); this.setData({ showEditProject: false }); this.loadWorkspace();
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: "保存失败", icon: "none" }); });
  },
  onDeleteProject() {
    const { deleteProject } = require("../../utils/api");
    wx.showModal({ title: "删除项目", content: "项目下的任务会保留并解除关联。确定删除？", success: (result) => {
      if (!result.confirm) return;
      wx.showLoading({ title: "正在删除..." });
      deleteProject(this.data.activeProjectId).then(() => {
        wx.hideLoading(); wx.showToast({ title: "已删除", icon: "success" }); this.setData({ activeProjectId: "", activeProject: null, showEditProject: false }); this.loadWorkspace();
      }).catch(() => { wx.hideLoading(); wx.showToast({ title: "删除失败", icon: "none" }); });
    }});
  },
  onToggleCreateTask() { this.setData({ showCreateTask: !this.data.showCreateTask }); },
  onTaskTitleInput(event) { this.setData({ taskTitle: event.detail.value }); },
  onTaskNotesInput(event) { this.setData({ taskNotes: event.detail.value }); },
  onCreateTask() {
    const { createTask } = require("../../utils/api");
    if (!this.data.taskTitle.trim()) { wx.showToast({ title: "先写任务标题", icon: "none" }); return; }
    wx.showLoading({ title: "正在添加..." });
    createTask({ title: this.data.taskTitle, notes: this.data.taskNotes, projectId: this.data.activeProjectId }).then(() => {
      wx.hideLoading(); this.setData({ showCreateTask: false, taskTitle: "", taskNotes: "" }); this.loadWorkspace();
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: "任务没添加成功", icon: "none" }); });
  },
  onTaskEditTap(event) { wx.navigateTo({ url: `/pages/task-edit/task-edit?id=${event.currentTarget.dataset.id}` }); },
  onProfileTap() { wx.navigateTo({ url: "/pages/profile/profile" }); },

  onToolsTap() { wx.reLaunch({ url: "/pages/tools/tools" }); },
  onTabTap(event) { const key = event.currentTarget.dataset.key; const routes = { today: "/pages/today/today", desk: "/pages/workspace/workspace", review: "/pages/review/review" }; if (key === "desk" || !routes[key]) return; wx.reLaunch({ url: routes[key] }); }
});