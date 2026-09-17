# 中心托管部署指南

> **本文已过时（SQLite 阶段文档）**
>
> 数据库现在是 Neon Postgres，公开部署走 EdgeOne（见 [docs/deploy-edgeone.md](./deploy-edgeone.md)）。
> 文中出现的 `DATABASE_URL="file:./dev.db"`、`prisma/dev.db` 都已失效 ——
> Prisma 会直接拒绝 `file:` 连接串（必须以 `postgresql://` 开头）。
> `APP_ACCESS_PASSWORD` 也已在应用代码里没有任何地方读取，"访问密码"从来没有生效过。
> 保留本文只为追溯历史。


这个方案适合“由你提供 DeepSeek API Key，访客只访问你部署的网页，不接触 Key”。

## 架构

- Next.js 服务端持有 `DEEPSEEK_API_KEY`
- AI 调用记录写入 `ai_usage_logs`
- 每次调用前检查访客日配额和全站日配额
- 配额耗尽时自动降级为本地规则，不再调用 DeepSeek
- 访客通过 HttpOnly Cookie 获得匿名 ID，用来按访客限流

## 环境变量

```env
DATABASE_URL="file:./dev.db"
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_MODEL="deepseek-v4-flash"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
APP_ACCESS_PASSWORD="请改成你自己的访问密码"

AI_QUOTA_ENABLED=true
AI_QUOTA_DAILY_CALLS=500
AI_QUOTA_DAILY_TOKENS=1000000
AI_QUOTA_VISITOR_DAILY_CALLS=20
AI_QUOTA_VISITOR_DAILY_TOKENS=50000
```

`AI_QUOTA_ENABLED=true` 时，用户浏览器里填写的 API Key、模型、Base URL 会被忽略，AI 调用只走服务端配置。

## 部署到单实例服务器

1. 准备一台能长期运行的 Linux 或 Windows 服务器，安装 Node.js 20+ 和 pnpm。
2. 克隆仓库并安装依赖。
3. 创建 `.env`，填写上面所有变量。
4. 执行数据库迁移：

```bash
pnpm db:migrate:deploy
pnpm db:generate
pnpm build
pnpm start
```

5. 用 Nginx 或 Caddy 反代到 `localhost:3000`，启用 HTTPS。
6. 使用 `pm2` 或 systemd 保持进程常驻。

## 配额查看

每天的真实 token 消耗会写入 SQLite 的 `ai_usage_logs` 表。可以用 Prisma Studio 查看：

```bash
pnpm db:studio
```

## 后续多用户改造

当前访客身份是匿名 Cookie，适合控制 API 成本，但数据仍然共享。等需要“每个人保存自己的数据”时，再把 Project、Task、Inbox、Review 增加 `userId`，并把 SQLite 迁到 PostgreSQL。
