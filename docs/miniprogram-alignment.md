# 小程序 ↔ 网页 对齐验收清单

> 2026-10-17。基准：手机视口下的当前网页。目标不是“看起来差不多”，而是页面结构、信息层级、文案、状态和交互逐项一致；仅保留微信平台必须存在的差异。
> 每次新增页面或改动组件，先回到这份清单确认，不能从旧小程序结构反向作为基准。

## 一、唯一视觉基准

- 网页组件和手机视口截图是唯一视觉真源。
- 小程序改动前必须先列出：网页组件 → 小程序节点 → 文案 → 状态 → 交互 → 平台差异。
- 页面截图统一使用 `390 × 844`，重点状态包括：空态、有数据、展开、加载、完成、深色模式。
- 数据契约仍由 `today-view.ts`、`files-view.ts`、`profile-view.ts` 提供，小程序不另写聚合。

## 二、视觉组件映射

| 网页 | 小程序 | 对齐内容 |
| --- | --- | --- |
| `Sidebar` 手机头部 | `components/app-header` | 品牌块、白色玻璃底、固定顶部、状态栏避让 |
| `Sidebar` 底部导航 | `custom-tab-bar` | 三页、选中色、Lucide 同款图标、56px 高度 |
| `SiteFooter` | `components/site-footer` | 分隔线、`走走 v3.5 · Coded by 氵` |
| `QuickCapture` | `pages/today` 快速记录卡 | 大输入框、通栏下一步、三条示例、换一批 |
| `PanelHeader` | 今日建议头部 | 列表图标、标题、右侧数量 |
| `TaskRowDisclosure` | 今日 / 文件任务标题行 | 短标题、展开箭头、点击展开 |
| `TodayTaskActions` | 任务状态按钮 | 待办 → 进行 → 完成，完成终态 |
| `TaskStickyInline` | `components/task-sticky` | 步骤卡、历史便利贴、补充输入、等待文案 |
| `InboxClarification` | 今日澄清对话 | 回答即时显示、选项、多选、自己说、完成态 |
| `FirstRunTour` | 今日 `tour-hint` | 三步提示、文案、步骤计数、关闭与推进 |
| `FileBrowser` | `pages/workspace` | 模式排序、模式分组、文件夹标签、就地展开 |
| `StagePreviewPanel` | 文件页长期项目 | 当前阶段、下一阶段、进入下一阶段 |
| 探索线路图 | 文件页探索项目 | 主线 / 支线、当前推进任务 |
| 文件页内嵌复盘 | 文件页顶部复盘面板 | 标题、关闭、摘要样式 |
| `ProfileNameCard` | 个人页名片 | 头像、昵称、编辑、三模式计数 |
| `ThemeToggle` / `AiSettings` / `LogoutButton` | 个人页功能区 | 夜间模式状态、API 连接状态、退出登录 |
| 网页登录页 | `pages/login` | 品牌、加入我们、输入框、确认、返回看看 |
| 网页欢迎流程 | `pages/onboarding` | 四步结构、字段、按钮、AI 澄清和完成落库 |

## 三、跨端行为（同一份实现）

| 行为 | 共享实现 | 小程序入口 |
| --- | --- | --- |
| 长期项目进入下一阶段 | `src/lib/project-stage-advance.ts` | `POST /api/miniprogram/projects/stage/advance` |
| 今天要做的 AI 取舍 | `src/lib/today-focus-generate.ts` | `POST /api/miniprogram/today/focus` |
| 任务执行合同字段 | `src/lib/task-contract-fields.ts` | 任务更新 / 阶段推进共用 |
| 任务状态变更 | `src/lib/task-status.ts` | `POST /api/miniprogram/tasks/status` |
| 复盘保存 | `src/lib/review-save.ts` | `POST /api/miniprogram/review/save` |
| 项目编辑 | `src/lib/project-update.ts` | `POST /api/miniprogram/projects/update` |
| AI 辅助编辑 | `src/lib/ai-edit-suggestions.ts` | `POST /api/miniprogram/ai/{task,project}/edit` |
| 澄清与计划 | `src/lib/inbox-ai.ts`、`src/lib/agent-plan/` | `POST /api/miniprogram/ai/inbox/*` |
| 首启四步流程 | `src/lib/onboarding-flow.ts` | `POST /api/miniprogram/onboarding/flow` |

## 四、刻意保留的平台差异

| 项 | 网页 | 小程序 | 原因 |
| --- | --- | --- | --- |
| 系统外壳 | 浏览器地址栏 | 微信胶囊、状态栏、安全区 | 微信宿主固定存在 |
| 主头部 | 普通 sticky 头部 | 状态栏下方的固定玻璃头部 | 不能覆盖微信胶囊 |
| 删除 / 下载 | 浏览器下载 | 微信文件能力或服务端导出 | 平台 API 不同 |
| 输入提交 | Enter / 点击 | 键盘 confirm / 点击 | 触屏范式 |
| 外部收起 | 点空白 / Esc | 点标题 / 关闭按钮 | 触屏没有键盘 Esc |
| 桌面导航 | 左侧栏 | 不渲染 | 小程序只复刻手机网页 |
| 管理后台 | 网页后台 | 不渲染 | 非用户主流程 |
| 欢迎流程 | 当前总开关关闭 | 同步关闭 | 两端必须同开关 |

## 五、门禁

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`（包含双端文案、主页面头部、欢迎开关不变量）
- `pnpm verify:miniprogram`
- 人工核对手机视口截图：今日、文件、个人、登录、落地页、深色模式、任务展开态。

## 六、发布前人工检查

- 微信开发者工具中重新编译并清理缓存。
- 用同一测试账号比较网页与小程序三页首屏。
- 检查深色模式。
- 检查任务展开后的便利贴。
- 检查文件页文件夹展开、长期阶段、探索线路图和复盘面板。
- 检查登录页文案和错误提示。
- 上述通过后，才进入“上传开发版本 → 提交审核”。上传和提审均不由自动任务执行。
