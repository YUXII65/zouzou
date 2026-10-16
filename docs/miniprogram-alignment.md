# 小程序 ↔ 网页 对齐验收清单

> 2026-10-16。目标：小程序不再是自己抄一份的实现，而是消费网页同一份数据契约和业务规则；差异只保留"平台范式"层面。
> 每次改动如果新增页面 / 接口 / 联动逻辑，先回到这份清单确认有没有制造新的第二实现。

## 一、数据契约（同一份服务端视图）

| 页面 | 契约 | 网页 | 小程序 |
| --- | --- | --- | --- |
| 今天 | `src/lib/today-view.ts` `buildTodayView` | `src/app/page.tsx` | `GET /api/miniprogram/today`、`/api/miniprogram/prefetch` |
| 文件 | `src/lib/files-view.ts` `buildFilesView` | `src/app/files/page.tsx` | `GET /api/miniprogram/workspace` |
| 个人 | `src/lib/profile-view.ts` `buildProfileView` | `src/app/profile/page.tsx` | `GET /api/miniprogram/me` |

已删除的私有聚合：`src/lib/miniprogram-today.ts`（小程序的旧今日视图）。

小程序端只做渲染与局部交互，不再判 `answer`、不拼 `dimensions`、不自己排序取任务。

## 二、跨端行为（同一份实现）

| 行为 | 共享实现 | 小程序入口 |
| --- | --- | --- |
| 长期项目进入下一阶段 | `src/lib/project-stage-advance.ts` | `POST /api/miniprogram/projects/stage/advance` |
| 今天要做的 AI 取舍 | `src/lib/today-focus-generate.ts` | `POST /api/miniprogram/today/focus` |
| 任务执行合同字段 | `src/lib/task-contract-fields.ts` | 任务更新 / 阶段推进共用 |
| 任务状态变更（含阶段预览、反馈统计） | `src/lib/task-status.ts` `applyTaskStatus` | `POST /api/miniprogram/tasks/status` |
| 复盘保存（含 decisionJson） | `src/lib/review-save.ts` `saveReviewData` | `POST /api/miniprogram/review/save` |
| 项目编辑（含 ensureCurrentProjectStage） | `src/lib/project-update.ts` `updateProjectData` | `POST /api/miniprogram/projects/update` |
| 任务/项目 AI 辅助编辑（含 decisionMemory） | `src/lib/ai-edit-suggestions.ts` | `POST /api/miniprogram/ai/{task,project}/edit` |
| 澄清与计划 | `src/lib/inbox-ai.ts`、`src/lib/agent-plan/` | `POST /api/miniprogram/ai/inbox/*` |

已删除：`answer` 直答出口（`generateDirectAnswer` / `DIRECT_ANSWER_SYSTEM_PROMPT` / `createDirectAnswerPlan`）。

## 三、清掉的旧概念

- 小程序独立「直接回答」面板、`directAnswers` 状态；
- 问卷式澄清卡（`dimensions` 选项 + 确定方向）；
- 复盘页旧底部导航「日历 / 书桌 / 抽屉」、标题「抽屉」；
- 新手引导第 4 步「点抽屉复盘」；
- `pages/tools` 完整工具页（降级为跳文件页的兜底）；
- 落地页价值主张里的「每晚轻量复盘，AI 自动生成明天计划」；
- actions 里重复的 `projectStatus`、任务合同字段、任务状态、复盘保存、项目编辑、AI 建议上下文。

## 三点五、过渡期兼容（发布期间）

- 线上小程序是旧包时，`/api/miniprogram/today` 与 `/api/miniprogram/prefetch` 会通过 `withLegacyTodayFields`（`src/lib/today-view.ts`）同时返回旧字段名（`pendingItems` / `tasks` / `completedToday` / `totalToday` / `openTasks` / `streak` / `weekDone` / `reviewCount`，以及每个任务的 `dueDateText` / `sticky`），保证旧包不空列表。
- 新包全量发布并观察一段时间后，删掉 `withLegacyTodayFields` 和两个调用点即可。
## 四、刻意的平台差异（不算漂移）

| 项 | 网页 | 小程序 | 原因 |
| --- | --- | --- | --- |
| 主题按钮文案 | 显示点一下会切到的模式 | 显示当前模式 | 2026-10-16 明确要求 |
| 任务展开收起 | 点外部 / Esc 收起 | 点标题切换 | 触屏范式 |
| 复盘 | 文件页内嵌面板 | 独立页 `pages/review` + 文件页入口 | 小程序页面粒度 |
| 导出 | `/api/export` 带下载头 | `/api/miniprogram/export` 返回 JSON | 平台下载方式不同；查询与 payload 结构一致 |
| 错误提示 | 卡片内文案 | `wx.showToast` | 平台交互 |
| 示例池载体 | `src/lib/sample-ideas.ts` | `miniprogram/utils/sample-ideas.js`（生成产物） | 小程序不能直接 require TS；`scripts/sample-ideas-sync.test.mjs` 防漂移 |

## 五、门禁

- `pnpm typecheck`、`pnpm test`（181 条，含示例池同步门禁与 API 鉴权不变量）、`pnpm build`；
- `pnpm check:online`（8/8，含小程序主包体积）；
- `pnpm verify:miniprogram`：扫描 `miniprogram/pages/**`，检查 WXML 绑定的事件在 JS 里有实现、`<view>` 标签成对（当前 9 个页面全过）。

## 六、未完成

- 小程序 `onboarding` 仍是独立 3 屏介绍页（网页是锚定气泡），只对齐了步数与内容；
- 发布：需推 `codex/edgeone-deploy` + `main`，并在微信开发者工具上传新版本。