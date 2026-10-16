# 把数据库搬到离用户更近的区域（操作手册）

## 为什么要做

实测（本机 → 线上依赖）：

| 环节 | 耗时 |
| --- | --- |
| Neon 单次查询（us-east-2 俄亥俄） | 215~450ms，冷启动首连 2.5~5.2s |
| 模型（deepseek-v4-flash） | 首字节 0.74s / 整段 3.2s |
| 一次「提交想法 → 出澄清」 | ~4.5s（其中非模型部分约 1.3s，且抖动 ±1s） |

换到新加坡/香港后，单查询预计降到 20~40ms：**非模型等待从 ~1.3s 压到 ~0.3s，并消掉大部分抖动**。

数据量很小，搬迁只是几秒钟的事：users 74、projects 53、tasks 190、inbox_items 181、usage_events 1223，合计约 2500 行。

---

## 步骤（需要你在 Neon 控制台操作的部分只有第 1 步）

### 1. 在 Neon 建一个新项目，区域选 Singapore

- Neon Console → New Project → Region 选 **AWS ap-southeast-1 (Singapore)**
- 建好后复制两条连接串：**Pooled connection**（用作 `DATABASE_URL`）和 **Direct connection**（用作 migrate 的 `DIRECT_URL`）

### 2. 把结构推到新库

```powershell
$env:DATABASE_URL="<新库 pooled>"; $env:DIRECT_URL="<新库 direct>"
node node_modules/prisma/build/index.js migrate deploy
```

### 3. 先干跑，核对两张表数量一致

```powershell
$env:SOURCE_DATABASE_URL="<旧库>"
$env:TARGET_DATABASE_URL="<新库 pooled>"
node scripts/db-copy.mjs --dry-run
```

脚本会逐表打印「源库 / 目标库」的行数。**两边一致（目标库此时应该都是 0）再往下走。**

### 4. 真正搬迁

```powershell
node scripts/db-copy.mjs --yes
```

脚本按外键顺序写入，结束后自动校验每张表数量，全部打 ✓ 才算成功。ID 原样保留，关联不断。

### 5. 本地切到新库并验证

把 `.env` 的 `DATABASE_URL` / `DIRECT_URL` 换成新库，然后：

```powershell
node node_modules/prisma/build/index.js migrate deploy   # 应该显示 already applied
pnpm dev                                                  # 或重启 preview
```

验证清单：
- [ ] 首页能打开，任务/项目/复盘数量和搬迁前一致
- [ ] 提交一个想法，能出澄清（AI 链路通）
- [ ] 量一次「提交 → 出澄清」，应该明显更快、且不再抖

### 6. 线上同步（EdgeOne）

EdgeOne Pages → 项目 → 环境变量，把 `DATABASE_URL` / `DIRECT_URL` 换成新库，然后重新部署。
**只改本地没有用**，线上仍是旧库。

---

## 回滚

旧库在验证通过前**不要删**。出问题就把 `DATABASE_URL` / `DIRECT_URL` 换回旧库、重启即可，数据没有破坏性改动。

## 已知注意事项

- 迁移期间旧库仍在被写入（线上在跑），所以**第 3~6 步之间最好没有新数据产生**；如果线上一直在用，就在第 4 步前再跑一次 `--dry-run` 确认行数。
- `db-copy.mjs` 的写入路径已于 2026-10-02 在真实目标库跑通。注意它会先清空目标库业务表再写，所以**只能对着空库/新库跑**。
- 循环外键 `projects.createdFromInboxItemId -> inbox_items` / `inbox_items.projectId -> projects` 已由脚本处理（写 project 时置空、写完后回填）。改动这个脚本时别删这两步。
- 新库同样要保留 `DIRECT_URL`（migrate 需要直连，不能用 pooler）。
