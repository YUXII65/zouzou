# 测试、CI 与 AI 质量回归

> 在 v2.5 之前，这个项目没有任何自动化检查：没有测试文件、`.github/workflows` 是空目录、
> `pnpm lint` 本身也是坏的。这份文档说明现在有什么、怎么跑、以及为什么这么设计。

## 一条命令

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint（扁平配置）
pnpm test        # node:test（内置运行器，零新增依赖）
```

三者都会在 CI 里跑：`.github/workflows/ci.yml`，触发条件是 push 到 `main` / `codex/**` 和所有 PR。

**本机 Node 24，CI 用 Node 22**，所以这三条在 Node 22.23.2 上单独验过一遍（tsc / eslint / 测试命令全部退出码 0）。
版本敏感的是测试那条：依赖 `--experimental-strip-types`（22.6+）和测试运行器的 glob 展开（22+）。

## 为什么不装 vitest / tsx

Node 24 自带 TypeScript 类型擦除，`node --test` 就是内置测试运行器。
唯一缺的是 `@/*` 路径别名，用一个二十行的模块解析钩子补上：

- `scripts/ts-alias-hooks.mjs` —— 把 `@/x` 解析到 `src/x`，并补全省略的扩展名
- `scripts/ts-alias-loader.mjs` —— `--import` 的入口

**零新增依赖**，和项目里其他 `scripts/*.mjs` 的风格一致。

约束：类型擦除只支持「可擦除语法」。写测试和被测代码时不要用 `enum`、`namespace`、
构造函数参数属性；类型导入必须写成 `import { type Foo }` 或 `import type`。
（现有代码已经是这个风格，加新代码时注意保持。）

## 测试覆盖什么

测试文件与被测模块放在一起（`src/lib/*.test.ts`），脚本侧的校验逻辑放在 `scripts/lib/*.test.mjs`。`pnpm test` 两个目录都跑。断言的是**产品规则**，不是实现细节：

| 文件 | 盯住的规则 |
| --- | --- |
| `tool-router.test.ts` | 写操作必须 `confirm-write`，绝不能被判成"可以直接做"；网址 / 仓库 / 文档 / 最新信息各走各的通道 |
| `task-contract.test.ts` | quick=1、tool/produce=2、explore/project=3 的轮次映射；完成标准不含空泛说法、要引用具体对象 |
| `ai-quality.test.ts` | 空泛说法、模板句、shortTitle 截断、maxTurns 与 executionMode 不一致；回归门禁的判定逻辑 |
| `ai-prompts.test.ts` | 生产提示词里执行合同与反模板句的规定不能被静默删掉 |
| `sample-ideas.test.ts` | 示例池 ≥100 条、无重复、无「某个 / 一件事」这类占位表达 |
| `date.test.ts` / `task-sticky.test.ts` | 日期边界；坏 JSON 不让页面崩 |
| `scripts/lib/db-tables.test.mjs` | 备份校验器与恢复计划：外键映射与 `schema.prisma` 一一对应、悬空外键和空必填外键能被抓出来、恢复顺序与自环外键处理、连接串引号归一化 |
| `scripts/verify-restore.mjs`（CI 单独一步） | 起临时 Postgres（PGlite）真跑一遍恢复，再**逐行逐字段**与备份比对。只查行数会漏掉回填把 `updatedAt` 刷成"现在"这类静默改写 |

这套测试已经抓到过一个真实漏洞：「帮我注册一个账号」当时被路由成
`none / 不依赖外部信息，可以直接做`，而 `tool-router.ts` 文件顶部写明的意图正相反。

## 仓库级不变量

`scripts/lib/repo-invariants.test.mjs` 盯的不是某段代码的行为，而是"整个项目不许再犯的错"。
每一条都来自一个真实踩过的坑：

| 不变量 | 对应的坑 |
| --- | --- |
| 应用代码不得引用 `prisma/dev.db` | 数据库迁到 Postgres 后，读 `dev.db` 的代码依然跑得通，只是读一份死文件。这个坑踩了两次：`scripts/backup-db.mjs` 和 `src/app/api/backup/route.ts`。后者更糟 —— 它是个**没有鉴权**的公开路由，任何人访问就能拉走那份文件。而部署环境里根本没有 `dev.db`（未被 git 跟踪），所以它线上必然 500。该路由已删除。 |
| 每个 API 路由要么调用鉴权，要么进 `PUBLIC_ROUTES` 白名单并写明理由 | 上面那个路由漏写鉴权。旁边的 `/api/export` 是有的，说明是漏写而非设计。 |
| 白名单里的路径必须真实存在 | 防止白名单名写错之后静默失效。 |
| 公开路由不超过 1 个 | 公开路由变多时应该有人重新审一遍，而不是默默放行。 |

这些守卫都做过反向验证：临时放入违规文件，确认测试会失败并指出具体文件名。

## AI 质量回归

AI 输出不像纯函数那样有唯一正确答案，所以分两层：

**第一层：可以判死的东西（自动，每次 CI 跑）**
`src/lib/ai-quality.ts` 里的 `checkPlanQuality`：任务数上限、`doneWhen` 是否缺失、
`maxTurns` 与 `executionMode` 是否自洽、`shortTitle` 是不是直接截断标题、
是否出现「初版 / 最小一步 / 先确认方向」这类空泛说法和「我大概知道你真正看重什么了」
这类模板句。这些不需要调模型就能测，所以有单测覆盖。

**第二层：真实模型输出（手动跑，要花 token）**

```bash
pnpm eval:ai                                    # 跑全部用例，覆盖 docs/ai-eval-baseline.*
pnpm eval:ai --limit=3                          # 只跑前 3 条
pnpm eval:ai --label=v2.6                       # 写成 docs/ai-eval-baseline-v2.6.*
pnpm eval:ai --compare=docs/ai-eval-baseline.json   # 和基线对比，有回归就非零退出
pnpm eval:ai --print-prompt                     # 只打印生产用的 system prompt，不调模型
```

### 关键前提：评测必须跑生产那一份提示词

之前 `scripts/evaluate-ai.mjs` 里**另写了一份** system prompt。改 `src/lib/ai.ts`
不会反映到评测里，所以"评测通过"说明不了生产输出合格——这是最坏的一种假绿灯。

现在提示词集中在 `src/lib/ai-prompts.ts`：

- `PLAN_SYSTEM_PROMPT` —— `planInbox` 的 system prompt
- `OUTPUT_QUALITY_RULES` —— 全局输出约束，`callModel` 会给每条 system prompt 追加
- `buildPlanUserPayload` —— user 消息的字段与默认值

生产代码和评测脚本导入同一份常量，字段不会再各写各的。

### 提示词指纹

每次评测会把 `sha256(PLAN_SYSTEM_PROMPT + OUTPUT_QUALITY_RULES)` 的前 12 位写进结果文件。
对比基线时先看这个指纹：

- 指纹相同 → 差异来自模型波动或随机性；
- 指纹不同 → 是你改了 prompt，输出变化要按"改动的效果"来读，而不是当噪声。

### 怎么用

改完 prompt 或升级模型之后：

```bash
pnpm eval:ai --compare=docs/ai-eval-baseline.json
```

- 退出码 0：没有新增失败；
- 退出码 1：有新增失败，或者有用例从通过变失败。

> 历史基线（`ai-eval-baseline-next-step.*`、`ai-eval-baseline-shixu.*`、`ai-eval-baseline-v1.5-final.*`）
> 是用旧脚本里那份**独立的** system prompt 跑出来的，和现在的生产提示词不是同一份，
> 不能拿来当对比基线。拿它们对比时脚本会提示"基线里没有提示词指纹"，这是预期行为。
> 现行基线是 `ai-eval-baseline.*`。

注意两点：一是 `checkPlanQuality` 只能判"明显不合格"，任务是否真的切中用户处境仍然要人来读，
所以别把它当全自动门禁；二是新增用例失败、修好旧问题都不会拦你，只有**通过 → 失败**才算回归。

## 改动 lint 配置时注意

`eslint.config.mjs` 原来用 `FlatCompat` + `extends("next/core-web-vitals")`，那条路径会加载
`eslint-config-next` 里的 `@rushstack/eslint-patch`，该补丁在 ESLint 9.39 上会直接抛错：

```
Failed to patch ESLint because the calling module was not recognized
```

也就是说 `pnpm lint` 曾经**一次都没成功运行过**。现在改成用插件直接搭扁平配置
（`@next/eslint-plugin-next`、`@typescript-eslint/*`、`eslint-plugin-react`、`react-hooks`、`jsx-a11y`）。

这几个插件**在 `devDependencies` 里显式声明**了。原因值得记一下：它们本来是 `eslint-config-next`
的传递依赖，按 pnpm 默认布局只会进虚拟 store，不会出现在根 `node_modules`。本机根目录里那几份
能用，是更早一次 `npm install` 留下的实体目录（`eslint-plugin-react-hooks` 甚至是 7.1.1，
而 lockfile 里只有 5.2.0）。CI 用 `--frozen-lockfile` 全新安装不会有这些目录，
所以配置能跑通纯属本地环境巧合 —— 显式声明之后才是可复现的。

`react-hooks` 这里显式只开 `rules-of-hooks` 和 `exhaustive-deps`：新版 `recommended`
会带上 React Compiler 时代的整组规则（`set-state-in-effect` 等），对没有启用编译器的代码库是噪音。

当前 lint 结果是 **0 error / 22 warning**，warning 主要是未使用的导入和一些 `useEffect` 依赖 —— 没有拦，
但值得陆续清掉。
