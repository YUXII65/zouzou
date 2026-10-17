function canShowCaptureClarification(response) {
  const result = response && response.result ? response.result : response;
  return Boolean(result && result.itemId && result.clarification);
}

function isUsableInboxPlan(plan) {
  if (!plan || typeof plan !== "object") return false;
  if (plan.source === "agent_failed" || plan.source === "heuristic_fallback") return false;
  if (plan.action === "answer" || plan.responseMode === "answer") return true;
  return Array.isArray(plan.tasks) && plan.tasks.length > 0;
}

function normalizeTodayResult(result) {
  const source = result && typeof result === "object" ? result : {};
  const pendingInbox = Array.isArray(source.pendingInbox)
    ? source.pendingInbox
    : Array.isArray(source.pendingItems)
      ? source.pendingItems
      : [];
  const plannedTasks = Array.isArray(source.plannedTasks)
    ? source.plannedTasks
    : Array.isArray(source.tasks)
      ? source.tasks
      : [];
  const completedTodayTasks = Array.isArray(source.completedTodayTasks)
    ? source.completedTodayTasks
    : [];

  return {
    ...source,
    pendingInbox,
    plannedTasks,
    completedTodayTasks,
  };
}

module.exports = {
  canShowCaptureClarification,
  isUsableInboxPlan,
  normalizeTodayResult,
};
