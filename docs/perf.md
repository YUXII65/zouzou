# 性能（现行）

> 数据库已经在 `ap-southeast-1`（新加坡）。俄亥俄时期（`us-east-2`）的性能数字已作废，只保留在 [`decisions-log.md`](./decisions-log.md) 里作历史说明。
> 追求最快时先看这里；换区前后、改取数逻辑前后都要用量尺复核。

## 根因

- 慢的是**数据库往返次数**，不是模型，也不是数据量。
- Neon 这个端点在并发查询下会明显劣化：**查询一起发反而比一条条发更慢**。优化方向是减少往返次数，不是「让查询并行」。

实测（同一进程、连接已热）：

| 场景 | 耗时 |
| --- | --- |
| 单条 `task.count` | 219~230ms |
| 同一条 `SELECT 1` ×5 **并行** | 3289ms |
| 同一条 `SELECT 1` ×5 **串行** | 1679ms |
| `buildAiContext` 的 5 条查询单独跑 | 各 460ms（合计 ~2.8s） |
| 同样这 5 条一起跑 | 4.3~5.5s |

- 首页的查询本来就已经并行、慢也不是数据量造成的（账号只有 5 条任务照样 6 秒），这两条已排除，别再花时间。
- 另一个隐藏大头是**重复的 `getCurrentUser()`**：它的 React `cache()` 在 Route Handler / Server Action 里不去重，每调一次就是一次真实的 `users` 查询。一条完整澄清流程（首轮 → 回答一轮 → 出计划，3 个 HTTP 请求）从 **18 条 SQL 降到 12 条**，其中 `findUnique` 从 11 条降到 5 条；少的 6 条全是重复认证。

## 当前基线

参考点：`a1` = 新加坡、取数已合并、进程内缓存已开。

| 指标 | 数值 |
| --- | --- |
| 单次查询往返（中位） | 77ms（77/77/77/78/76，不抖） |
| `buildAiContext` 冷 / 热 | 830ms / ~0ms |
| 首页背景数据（中位） | 72ms |
| `/` 首字节 / 总耗时 | 145ms / 764ms |
| `/files` 首字节 / 总耗时 | 89ms / 312ms |
| 澄清请求首字节（认证那步） | 7~36ms |
| 澄清非模型开销 | 约 350~415ms |
| 澄清端到端（首轮 / 回答一轮 / 生成计划） | 3364ms / 3498ms / 7382ms |

- 澄清端到端已经基本只剩模型时间（对应采样 2949 / 3141 / 7011ms）。
- 模型侧下限：一次 `deepseek-v4-flash` 调用约 3.2s（实测首字节 0.74s）。再快只有换更快模型、或砍澄清输出 schema（会伤质量）。
- 一条想法从输入到出计划，用户实际等待已经从 **约 35 秒压到约 4.5 秒**。

## 有效的优化（保持，不要回退）

1. **取数合并成一条 SQL**
   - `buildAiContext`（`src/lib/ai-context.ts`）：5 个 Prisma 查询 → 1 条 `json_agg` raw SQL，冷启动 3740ms → 1190ms。输出做过逐字段对拍（3 个账号 × 2 种 kind），完全一致。
   - 首页读路径（`src/lib/home-support.ts`）：原来 6 条并发（新手状态 3 + 待整理 + 今日推荐 + 计数）→ 1 条 SQL，中位 694ms → 231ms，最差 4577ms → 694ms。
   - `getFirstRunState`（`src/lib/first-run.ts`）：偏好 + 项目数 + 任务数 3 条 → 1 条 SQL，逻辑抽成 `resolveFirstRunState()` 供首页和文件页共用。
   - 改这几处取数时，用 `scripts/bench-context-dump.mjs` + `scripts/bench-context-compare.mjs` 做逐字段等价对拍。
2. **别重复取用户**
   - `withAiQuota(feature, fn, userId?)` 有第三个可选参数：传了 `userId` 就直接算 `user:<id>`，不再打 `getVisitorId()` 那条查询（两者对登录用户完全等价）。19 个调用点都已补上。
   - `recordAiUsage` 优先用 ALS 上下文里的 `context.userId`，没有再回退 `getCurrentUser()`。
   - **写新代码时：在 Route Handler / Server Action 里需要用户信息只取一次，往下传。** 别再写 `await requireUser()` 之后又在别处 `await getCurrentUser()`。
3. **上下文 60 秒 TTL 内存缓存**（`src/lib/ai-context.ts`）
   - 一条想法从输入到出计划，`buildAiContext` 最多被调 5 次（澄清 1 + 每轮回答各 1 + 生成计划 1），每次查 6 张表。缓存 key = `kind:userId`，实测第 1 次 7795ms → 第 2、3 次 0ms，一次交互省 20 秒以上。
   - 导出 `invalidateAiContext(userId?)`，在会改变背景数据的写入后主动失效。当前接在确认计划、`setTaskStatus`、`saveReview` 之后；**新增任何改变「项目 / 任务 / 复盘 / 偏好 / 反馈」的写入路径都要补一个失效调用**。
   - 这是进程内缓存（`next start` 单进程最有效，EdgeOne 每个实例各一份）。数据变更后 60 秒内 AI 可能看到旧背景，这就是必须调 `invalidateAiContext` 的原因。
4. **澄清结束就预生成计划**
   - `advanceSocraticInboxClarification` 在结果为 `done` 时用 `after()` 在响应之后后台生成计划；`createInboxPlan` 开头短路（已有 `aiPlanJson` 直接返回），用户点「给我下一步」时几乎瞬时。
   - 代价：会在用户确认前提前消耗一次模型配额。这是刻意的取舍——走到「信息够了」，生成计划就是必然的下一步。
5. **澄清路径合并为一次写入**
   - `createSocraticInboxClarification` 原来是「create 拿 id（~450ms）→ 调模型 → update（~450ms）」两次跨洋写，现在改成 `randomUUID()` 自生成 id → 先调模型 → 一次 create 写入全部字段。
   - 失败语义：模型调用抛错时先补一条「只有 content」的记录再抛，用户写的东西不丢。
   - `createInboxClarification`（旧的兼容路径）还没合并。
6. **复合索引**（迁移 `20261001120000_add_perf_indexes`）：`inbox_items(userId,status)`、`tasks(userId,status)`、`projects(userId,status)`。首页和文件页的热查询都按这两列过滤；当前数据量小，这是「为增长买保险」，不是当下的大头。
7. **流式预览**：澄清和生成任务两步都能看到内容长出来（服务端本就在推可读增量，前端以前把它扔掉了）。这只改善感知延迟。

## 已证伪，别再试

- **池化端点（`-pooler`）**：单查询 236ms vs 直连 225ms，无差别（瓶颈是物理距离）。
- **`connection_limit=1`**：会把并发查询串行化，测到过 1.8s 也测到过 8.5s，不稳定，更慢（`buildAiContext` 6.2s vs 默认 4.3s）。不要用。
- **Prisma `relationJoins` preview**：已开启，`buildAiContext` 仍 6.0s，无可见收益（保留，生产低延迟环境下有理论收益）。
- **`after()` 预热不是首页变慢的原因**：把首页的 `after(buildAiContext)` 整段摘掉再重建，首页耗时没有变化（2.1~3.1s vs 2.7~4.6s）。**保留 `after()` 预热。**
- **让查询并行**：见「根因」，反了。

## 写 raw SQL 时的坑（必读）

- **时间列是 `TIMESTAMP(3)`（不带时区）**。Prisma 读出来按 UTC 解释，但 `json_agg` 返回的是不带 `Z` 的字符串，JS 的 `new Date()` 会按**本地时区**解析——东八区会整体偏 8 小时、甚至跨天（实测复盘日期 9/27 变 9/26）。必须走 `src/lib/ai-context.ts` 里的 `parseDbDate()`（缺时区后缀就补 `Z`）。
- `count(*)` 在 raw 查询里回来是 BigInt，记得 `Number()`。
- 空结果要用 `COALESCE(json_agg(...), '[]'::json)` 兜底，否则是 `null`。

## 量尺与验证工具（保留，勿删）

- `scripts/bench-latency.mjs`：**换区前后跑它**。输出单次往返、`buildAiContext` 冷 / 热、首页背景数据、`/` 和 `/files` 的首字节与总耗时。
- `scripts/bench-context-dump.mjs` + `scripts/bench-context-compare.mjs`：改 `buildAiContext` 取数时做逐字段等价对拍。
- `scripts/bench-context-edge.mjs`：空账号 / 零任务项目 / 只数未完成任务的边界。
- `scripts/bench-firstrun-eq.mjs`：新 `getFirstRunState` vs 旧实现的全库对拍。
- `scripts/bench-clarify-e2e.mjs`：澄清端到端量尺（首轮 / 回答一轮 / 生成计划三段），用临时账号，跑完自删。
- `scripts/bench-migrate-verify.mjs`：换库或大批量改数据后做关系完整性对拍。

数 SQL 条数的方法：临时在 `src/lib/prisma.ts` 的 `$allOperations` 里加 `if (process.env.PRISMA_QUERY_TRACE === "1") console.log("[qc] " + Date.now() + " " + operation);`，重建服务并用 `$env:PRISMA_QUERY_TRACE = "1"` 启动（守护进程要继承这个 env），跑 `scripts/bench-clarify-e2e.mjs` 后按时间戳过滤 `[qc]` 行统计。**测完一定要把这段临时代码删掉**，否则会在生产日志里刷屏。

## 端到端门禁的断言位置

`pnpm verify:clarify-flow` 的最后一步断言查的是真实 HTML。因为文件页在没有指定文件夹时全部收起，任务和便利贴不在 HTML 里，所以断言必须带参数打开对应文件夹：`/files?project=<id>`，无项目时用 `?view=unassigned`。**改文件页的展开行为时记得同步这个断言。**