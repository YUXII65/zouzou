# 走走

> 把脑子里的一堆想法，走成今天能做的 1-3 件事。

- 线上地址：<https://nextstep9.work>
- 当前版本：v2.5
- Coded by 氵

## 这是什么

走走是一个面向个人的 AI 项目推进系统。它不替你堆更多的待办，而是把一句真实想法收成一条今天能开始、完成后能验证的行动。

核心闭环：

`记想法 → 澄清 → 拆解 → 今天行动 → 复盘 → 下一轮`

## v2.5 重点

- 首页支持快速记录，AI 先理解对象、场景和真正想推进的方向，再生成可执行任务。
- 每条任务都带有执行合同：执行方式、完成标准、最大轮次和工具策略。
- 小任务一轮结束，不无限追问、不自动生成无穷尽的后续任务。
- 书桌支持项目、任务、便利贴和任务状态管理。
- 抽匣支持每日复盘，并把下一步任务自动归入对应项目。
- 工具匣按状态色系展示整理、未完成、已完成和复盘信息。
- 落地页保留 5 个不同处境的演示场景，首次进入随机选一版。
- 完成 3 个任务后，页面底部会出现「有改进意见？十分感谢！」入口。
- 首次引导相关代码保留在仓库中，当前按 v2.5 的收束界面为准。

## 技术栈

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS 4
- Prisma 6 + PostgreSQL
- lucide-react
- EdgeOne Pages 部署

## 本地运行

需要 Node.js 22+ 和 pnpm。

```bash
pnpm install
pnpm db:migrate:deploy
pnpm dev
```

打开 <http://localhost:3000>。

本地开发时数据库连接、AI Key 和会话密钥通过 `.env` 配置，不要提交到仓库。

## 目录

```text
src/app/          页面、路由和 Server Actions
src/components/   交互组件
src/lib/          AI、数据库、任务合同和通用逻辑
prisma/           数据模型与迁移
docs/             部署和设计说明
scripts/          备份、评估和维护脚本
```

## 部署

当前公开部署使用 EdgeOne Pages：

- 部署分支：`codex/edgeone-deploy`
- 构建命令：`npm run build:edgeone`
- 正式域名：<https://nextstep9.work>

推送 `codex/edgeone-deploy` 后会触发 EdgeOne 构建。部署期间可能出现极短的静态资源切换窗口，等待资源就绪或强制刷新即可。

## 数据与安全

- 每个账号只能访问自己的项目、任务、笔记和复盘。
- AI 请求由服务端统一发起，API Key 只放在托管平台环境变量中。
- 游客数据只保存在当前浏览器会话中；注册后才会长期保存。
- Prisma 迁移会随构建部署执行，发布前确认数据库环境变量已配置。
