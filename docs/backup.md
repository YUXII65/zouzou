# 数据库备份与恢复

> 走走的数据在 Neon Postgres。备份这件事曾经**静默失效**过一次，这份文档是为了让它不再悄悄退回去。

## 之前发生了什么

`scripts/backup-db.mjs` 最早是复制 `prisma/dev.db` —— SQLite 时代的文件。
数据库迁到 Neon 之后这个脚本没有跟着改，而 `prisma/dev.db` 一直留在仓库里没删，所以：

- 脚本照常"备份成功"，退出码 0；
- 备份出来的是 2026-08-09 那份早已作废的 SQLite 文件；
- `backups/` 里最后一次真实备份停在 2026-08-08，中间五周无人察觉。

**结论：不报错的错误最危险。**现在脚本改成走 Prisma 做逻辑导出，写完立刻回读校验，校验不过就非零退出。

## 备份是什么

一份 gzip 压缩的 JSON 逻辑导出，落在 `backups/zouzou-dump-<时间戳>.json.gz`：

```
format / version / createdAt / source（只记 host 和库名，不含密码）
counts    每张表的行数
data      13 张表的全部行
```

覆盖的表：`User` `Project` `InboxItem` `Task` `TaskStickyNote` `AiPlanFeedback`
`UserPreference` `AiFeedbackEvent` `Review` `ReviewTask` `ReviewNextAction`
`AiUsageLog` `UsageEvent`。

不依赖 `pg_dump`，所以本机、CI、任何装了 Node 的地方都能跑。

## 日常用法

```bash
pnpm db:backup              # 导出到 backups/，自动保留最近 30 份
pnpm db:backup --keep=7     # 只保留最近 7 份
pnpm db:verify              # 校验最近一份备份：格式 + 行数 + 引用完整性
pnpm db:verify --file=backups/zouzou-dump-20260917170814.json.gz
```

`db:verify` 检查两件事：

1. 每张表的实际行数和导出时记录的行数一致；
2. **引用完整性** —— 每个外键值都能在同一份备份里找到对应行，必填外键不为空。

第 2 条通过，就说明这份备份自洽、可恢复。校验不通过会以非零退出。

校验器本身有测试兜着（`scripts/lib/db-tables.test.mjs`）：外键清单必须与 `prisma/schema.prisma` 一一对应，
漏一个、多一个、目标表写错都会让 CI 红掉。原因是这个项目已经吃过一次教训 —— 校验逻辑如果自己就不可靠，
"校验通过"只是另一种形式的假绿灯。

**恢复顺序本身也有测试。**`buildRestorePlan` 把"先写什么、后写什么、哪里回填"抽成了纯函数，
单测覆盖：每张表恰好写一次、清空顺序与写入顺序相反、`Project` 在建 `InboxItem` 之前且自环外键置空、
回填排在正确位置、只回填非空值、以及**不修改传入的备份对象**（改写了会导致重复恢复时丢掉回填信息）。

**恢复本身也验过了。**`scripts/verify-restore.mjs` 会起一个临时 Postgres
（PGlite —— 编译成 WASM 的真实 Postgres，跑在内存里，不碰任何真实库），建好表，然后调用**生产同一份**
`restore-db.mjs` 做恢复，最后逐行逐字段比对：

```bash
pnpm db:verify:restore              # 用 backups/ 里最新一份真实备份
pnpm db:verify:restore --file=backups/xxx.json.gz
pnpm db:verify:restore:fixture      # 用内置小样本，不需要备份文件，CI 跑的就是这个
```

为什么比对要细到字段，而不是只数行数：**回填那一步走的是 `update`**，而 `Project.updatedAt`
带 `@updatedAt`。只查行数时一切正常，但 `updatedAt` 已经被刷成了恢复时刻 ——
项目列表按它排序，"停滞多少天"的判断会跟着错。

这个问题就是逐字段比对抓出来的。现在的结论是已验证：最新一份备份（13 张表 / 1780 行）
恢复后逐字段与备份完全一致。

## 自动化

三层，按可靠性排序：

| 方式 | 触发 | 依赖 | 状态 |
| --- | --- | --- | --- |
| GitHub Actions `backup.yml` | 每天 UTC 18:00（北京 02:00） | 仓库配置 `DATABASE_URL` secret | 需配置 secret 后生效 |
| 本机计划任务 | 每天 02:00 | 电脑开机并登录 | 需手动注册一次 |
| 手动 `pnpm db:backup` | 随时 | 无 | 可用 |

### 开启 GitHub Actions 备份

仓库 Settings → Secrets and variables → Actions → New repository secret：

- Name：`DATABASE_URL`
- Value：与 `.env` 里同一条 Neon 连接串

配好之后可以在 Actions 页面手动跑一次 `数据库备份` 验证。产物保留 30 天。

> 注意：备份产物包含用户数据（密码哈希、头像、想法内容）。仓库是私有的才适合这样存。
> 如果不希望数据离开 Neon，就只保留本机计划任务那一路。

### 注册本机计划任务

会写入系统配置，所以脚本不会自动执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1 -Time "23:30"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1 -Unregister
```

## 恢复

恢复会**清空目标库的同名表**，所以必须显式给两个参数，并且不允许恢复到 `DATABASE_URL` 指向的同一个库。

```bash
node scripts/restore-db.mjs --file=backups/xxx.json.gz --into="postgresql://目标库" --yes
```

恢复顺序按外键依赖排好；`Project.createdFromInboxItemId` 与 `InboxItem.projectId` 互相引用，
所以先建项目（该字段置空）→ 建收件箱条目 → 再回填这条自环外键。

**验证恢复流程的正确方式**是找一个一次性数据库（例如新建一个 Neon 分支）跑一遍，
而不是等到真出事才第一次用。

## 遗留文件

`prisma/dev.db` 和 `backups/*.db` 是 SQLite 时代的残留，已被 `.gitignore` 忽略，脚本不会再读写它们。
确认不需要之后可以手动删掉；在那之前它们只是占地方，不会影响现在的备份。

## 检查清单

- [ ] GitHub 仓库配好 `DATABASE_URL` secret，`backup.yml` 手动跑通一次
- [ ] 本机注册计划任务（可选）
- [ ] `backups/` 里出现当天的 `zouzou-dump-*.json.gz`
- [ ] `pnpm db:verify` 通过
- [ ] `pnpm db:verify:restore` 通过（真跑一次恢复并逐字段比对）
