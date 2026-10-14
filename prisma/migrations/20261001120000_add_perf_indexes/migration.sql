-- 热查询索引：首页/文件页都按 (userId, status) 过滤
CREATE INDEX "inbox_items_userId_status_idx" ON "inbox_items"("userId", "status");
CREATE INDEX "tasks_userId_status_idx" ON "tasks"("userId", "status");
CREATE INDEX "projects_userId_status_idx" ON "projects"("userId", "status");
