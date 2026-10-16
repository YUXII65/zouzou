<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 走走（zouzou）

把零散想法收成下一步的 AI 个人项目推进系统。Next.js 15（App Router）+ Prisma + Neon Postgres，配套微信小程序。线上 `https://nextstep9.work`（EdgeOne Pages），仓库 `YUXII65/zouzou`（公开）。

## 三页结构

- 首页 `/`：快速记录（CTA「下一步」）→ 澄清 → 计划卡 →「今天要做」。首屏不放日期面板、时钟、用量看板。
- 文件 `/files`：按模式分组的一列文件夹，就地展开；长期项目显示阶段总结，探索项目显示线路图 + 任务列表。
- 个人 `/profile`：名片（头像 / 昵称 / 三模式推进中计数）+ 功能区（夜间模式 / 退出登录 / API 连接）。侧栏不放主题开关和头像。
- `/tools`、`/workspace` 只是 302 到 `/files` 的旧链接兜底，不算页面。全局命令面板也只列这三页。
- **新增整屏页面必须同时加进 `src/lib/routes.ts` 的 `FULLSCREEN_ROUTES`**，否则页面会透出侧栏和底部导航。

## AI 链路（两段：翻译 → 方案）

- 第 1 段翻译 Agent（`translateIdea`）：用户原话 → 结构化 `translation`（`desiredOutcome` / `workingAssumption` / `ifWrongThen`），判 `readiness` 和 `responseMode`，**提问也由这一段负责**。
- 第 2 段方案 Agent（`PLAN_AGENT_SYSTEM_PROMPT`）：澄清收口后直接产出唯一执行路径 + 任务，填 `executionMode` / `doneWhen` / `maxTurns` / `toolPolicy` / `methodHint` / `recommendation` / `executionSteps` / `fallback`，只承接已定好的 `workMode`，不自己判 mode。
- 澄清**最少 2 轮、最多 4 轮**（到上限强制收口）；没有「直接回答」出口（2026-10-16 移除），任何输入都先澄清，再产出行动卡 / 任务。
- 三种模式 normal / longterm / explore 按「有没有终点」分，**用户永远不选模式**；模式在澄清收口之后、生成之前判定。
- 生产链只有这一条，旧三段链只作失败回退。全部细节见 [`docs/ai-pipeline.md`](docs/ai-pipeline.md)。

## 小程序与网页共用一份数据契约

- 三页各有唯一契约：今天页 `src/lib/today-view.ts`、文件页 `src/lib/files-view.ts`、个人页 `src/lib/profile-view.ts`；网页页面和 `/api/miniprogram/*` 都调同一份。
- 禁止在小程序端另写取数聚合（旧的 `src/lib/miniprogram-today.ts` 已删除）；小程序页面只做渲染和局部交互，不判业务分支（不判 `answer`、不拼 `dimensions`、不自己造状态）。
- 新增页面/区块时先抽共享视图函数，再让两端各自渲染；契约模块不要依赖 `next/headers` 这类 HTTP 运行时（纯函数抽到独立模块，如 `src/lib/guest-user.ts`）。
- 跨端行为也只能有一份实现：长期项目「进入下一阶段」共用 `src/lib/project-stage-advance.ts`（小程序走 `POST /api/miniprogram/projects/stage/advance`）；「今天要做」的 AI 取舍共用 `src/lib/today-focus-generate.ts`（小程序走 `POST /api/miniprogram/today/focus`）。不要在小程序端自己写事务或另调模型。任务执行合同字段（executionMode / doneWhen / methodHint / maxTurns / toolPolicy）统一走 `src/lib/task-contract-fields.ts` 的 `taskContractData`，任何入口都不要自己推断一遍。任务状态变更统一走 `src/lib/task-status.ts` 的 `applyTaskStatus`（小程序走 `POST /api/miniprogram/tasks/status`），阶段门控、阶段预览调度和完成反馈都在那里。复盘保存统一走 `src/lib/review-save.ts` 的 `saveReviewData`（小程序走 `POST /api/miniprogram/review/save`），decisionJson、下一步任务同步都在那里。项目编辑统一走 `src/lib/project-update.ts` 的 `updateProjectData`（小程序走 `POST /api/miniprogram/projects/update`），状态校验和 `ensureCurrentProjectStage` 都在那里。AI 辅助编辑统一走 `src/lib/ai-edit-suggestions.ts` 的 `buildTaskEditSuggestion` / `buildProjectEditSuggestion`（含 decisionMemory 上下文），不要在小程序里另拼一份上下文。
## 常用命令

```bash
pnpm dev            # 本地开发（Next 15）
pnpm build          # 生产构建；EdgeOne 用 pnpm build:edgeone
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint（扁平配置）
pnpm test           # node:test，含 src/**/*.test.ts 与 scripts/**/*.test.mjs
pnpm verify:miniprogram  # 小程序静态检查（事件实现 + 标签配对）
pnpm eval:ai        # 计划结构 + methodHint
pnpm eval:clarify   # 澄清（单轮 + 多轮）
pnpm eval:mode      # 模式判定（--gate 默认 0.9）
pnpm eval:first-run # 首启计划
pnpm verify:clarify-flow   # 真实 HTTP 澄清 → 计划端到端（需本地服务）
pnpm verify:clarify-retry  # 同一回答连续提交两次必须幂等
pnpm db:migrate / db:migrate:deploy / db:backup / db:verify:restore[:fixture]
pnpm check:online   # 上线前检查
```

## 改什么 → 跑什么

| 改动 | 门禁 |
| --- | --- |
| 任何改动（提交前） | `pnpm typecheck` + `pnpm lint` + `pnpm test` |
| 小程序页面 / 接口 | `pnpm verify:miniprogram` |
| 提示词、计划结构、任务字段 | `pnpm eval:ai`；动了首启计划再加 `pnpm eval:first-run` |
| 澄清逻辑 / 澄清 UI | `pnpm eval:clarify` + `pnpm verify:clarify-flow`（需本地服务） |
| 澄清重试、幂等、pending 清理 | `pnpm verify:clarify-retry` |
| 模式判定 | `pnpm eval:mode` |
| 文件页展开 / 阶段展示 / 线路图 | `scripts/verify-explore-tracks.mjs`（需本地服务） |
| 新手引导、点外部收起 | `scripts/verify-tour-dismiss.mjs`（需本地服务） |
| 备份恢复、数据库迁移 | `pnpm db:verify:restore:fixture`（CI 也跑这条） |
| 上线前 | `pnpm check:online` |

## 提交规则

- 提交后必须把 **`codex/edgeone-deploy` 和 `main` 推到同一个提交**。EdgeOne 跟随 `main`，只推 `codex/edgeone-deploy` 可能不触发发布。
- 不要提交 `docs/*.png`、`*.zip`、`text_*.json` 这类素材文件。
- 顶部 `nextjs-agent-rules` 块由 `next dev` 自动维护，保持原样；提交它能让工作区保持干净。
- 本地预览与构建的顺序（守护进程会抢 3000 端口）见 [`docs/runbook.md`](docs/runbook.md)。

## 红线

- 提示词里不准出现具体记录工具名（如「备忘录」）——负面例子也会被模型模仿。门禁：`src/lib/ai-quality.ts` 的 `RECORD_TOOL_PHRASES`。
- 任务「完成」是终态：按钮 `disabled`、点击直接 `return`，不允许再点回待办。
- 新增整屏页面必须加进 `FULLSCREEN_ROUTES`。
- 任务确认保存走 interactive transaction，**必须用 `withTransactionRetry`**；Neon 抖动导致写库失败时不能用「保存按钮没反应」糊过去。
- 任何 AI 请求都要有总时间预算（总 26s、单次 20s），不能让按钮无限停在「处理中」。
- 系统不实际联网、不接 Tool / MCP。需要外部信息时，输出「查什么 / 去哪查 / 按什么标准判断」的可用结论。
- 本机路径、数据库主机名等敏感信息只写 `docs/private/`（已在 `.gitignore`），主文档一律引用 [`docs/private/local.md`](docs/private/local.md)（仅本地）。

## 文档索引

| 文档 | 什么时候读 |
| --- | --- |
| [`docs/product.md`](docs/product.md) | 改 UI、页面、文案、交互、新手引导之前 |
| [`docs/ai-pipeline.md`](docs/ai-pipeline.md) | 改提示词、澄清、模式判定、任务字段之前 |
| [`docs/runbook.md`](docs/runbook.md) | 本地预览、部署、小程序上传发布、数据库操作、排障 |
| [`docs/perf.md`](docs/perf.md) | 改取数 / SQL / 缓存，或觉得慢的时候 |
| [`docs/decisions-log.md`](docs/decisions-log.md) | 怀疑某条规则「以前是不是反着写过」时 |
| [`docs/_open-questions.md`](docs/_open-questions.md) | 遇到文档说法冲突、或想认领未完成事项时 |
| `docs/testing.md` | 想知道测试 / CI / AI 评测怎么设计时 |
| `docs/beian-launch-runbook.md` | ICP 备案到小程序上线的完整操作 |
| `docs/deploy-edgeone.md` | EdgeOne 首次部署与账号配置 |
| `docs/backup.md` | 数据库备份恢复的具体步骤 |
| `docs/db-region-migration.md` | 换数据库区域的操作手册 |