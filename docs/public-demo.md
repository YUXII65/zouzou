# 公开演示服务

> **本文已过时（SQLite 阶段文档）**
>
> 数据库现在是 Neon Postgres，公开部署走 EdgeOne（见 [docs/deploy-edgeone.md](./deploy-edgeone.md)）。
> 文中出现的 `DATABASE_URL="file:./dev.db"`、`prisma/dev.db` 都已失效 ——
> Prisma 会直接拒绝 `file:` 连接串（必须以 `postgresql://` 开头）。
> `APP_ACCESS_PASSWORD` 也已在应用代码里没有任何地方读取，"访问密码"从来没有生效过。
> 保留本文只为追溯历史。
>
> **补充**：`scripts/start-public-demo.ps1` 现在已经加了失效守卫，运行会直接退出并说明原因，
> 不会再启动服务或公网隧道。


`scripts/start-public-demo.ps1` 会启动一个独立的公开演示实例：

- 端口：`3001`
- 数据库：`prisma/public-demo.db`
- 访问密码：默认 `123456`，可用 `PUBLIC_DEMO_PASSWORD` 修改
- AI 配额：默认按访客每天 10 次调用 / 20000 token，全站每天 200 次 / 100000 token
- 公网地址：写入 `.public-demo/tunnel.url`

该演示实例不会读取或写入个人使用的 `prisma/dev.db`，适合先公开给少量人体验。

公开实例始终使用服务端 `DEEPSEEK_API_KEY`，用户不能通过浏览器配置自己的 API Key。

## 启动

```powershell
pnpm public:demo
```

需要重新生成演示数据时：

```powershell
pnpm public:demo:reset
```

## 配额配置

可以通过环境变量覆盖默认额度：

```env
AI_QUOTA_ENABLED=true
AI_QUOTA_DAILY_CALLS=200
AI_QUOTA_DAILY_TOKENS=100000
AI_QUOTA_VISITOR_DAILY_CALLS=10
AI_QUOTA_VISITOR_DAILY_TOKENS=20000
```

调用记录写入 `ai_usage_logs` 表，方便查看当天实际 token 消耗。

## 注意事项

Cloudflare 快速隧道生成的是临时域名，电脑重启或隧道重连后地址可能变化。如果要长期稳定公开，建议把数据库迁到 PostgreSQL，并部署到支持持久化磁盘的单实例服务器，而不是继续用本机 SQLite 加隧道。
