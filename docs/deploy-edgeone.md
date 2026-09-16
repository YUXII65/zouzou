# EdgeOne Pages 免费公开部署

这是面向中国大陆访问的公开部署方案。公开版使用 PostgreSQL，每个注册用户的数据按账号隔离，不需要用户自己填 API Key。

## 准备工作

1. 已有 GitHub 仓库：`YUXII65/zouzou`。
2. 已有 Neon 免费数据库，并复制出 `DATABASE_URL` 和 `DIRECT_URL`。
3. 已有 DeepSeek API Key。
4. 需要一个自定义域名。域名本身通常一年几十元以内，不是按月租服务器。

## 为什么需要自定义域名

EdgeOne Pages 的项目域名默认带访问保护：

- 加速区域为“全球可用区（不含中国大陆）”时，中国大陆网络访问默认域名会返回 401。
- 绑定自定义域名后，即使没有 ICP 备案，也可以给中国大陆用户使用。

所以公开分享必须绑定自定义域名。没有域名的话，可以先买一个便宜的域名，再继续下面的步骤。

## 在 EdgeOne 部署

1. 注册并登录腾讯云账号，进入 EdgeOne Makers / Pages 控制台。

   控制台入口：<https://console.cloud.tencent.com/edgeone/makers>。

2. 开通免费版。
3. 绑定 GitHub，授权访问 `YUXII65/zouzou`。
4. 导入仓库，分支选择 `codex/edgeone-deploy`。
5. 加速区域选择“全球可用区（不含中国大陆）”。
6. 构建配置保持仓库默认即可，仓库里的 `edgeone.json` 会自动使用：

```bash
npm run build:edgeone
```

也就是依次执行：

```bash
prisma generate
prisma migrate deploy
next build
```

## 配置环境变量

在 EdgeOne 项目的环境变量里配置：

```env
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
DIRECT_URL="postgresql://user:password@host/dbname?sslmode=require"
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_MODEL="deepseek-v4-flash"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
AUTH_SECRET="一段很长的随机字符串"
ADMIN_USERNAME="YUXII"

AI_QUOTA_ENABLED=true
AI_QUOTA_DAILY_CALLS=500
AI_QUOTA_DAILY_TOKENS=1000000
AI_QUOTA_VISITOR_DAILY_CALLS=50
AI_QUOTA_VISITOR_DAILY_TOKENS=200000
```

也可以复制 `.env.edgeone.example`，再按 EdgeOne 的批量导入格式粘贴。

## 绑定域名

1. 在 EdgeOne 项目设置中添加自定义域名。
2. 按控制台提示去域名注册商修改 DNS 记录，通常是 CNAME 或 ALIAS。
3. 等待 DNS 生效和 HTTPS 证书签发。
4. 用手机流量打开你的域名，确认不再白屏。

## 部署后检查

1. 注册两个账号，确认互相看不到对方数据。
2. 创建任务后刷新，再重新登录，确认任务还在。
3. 使用 AI 功能，确认能正常生成计划。
4. 检查 Neon 控制台里的 `ai_usage_logs`，确认用量在每天限额内。

## 常见问题

如果部署后访问页面提示 `Middleware execution failed`，通常是 EdgeOne 边缘运行时与 Next.js `proxy.ts` 的兼容问题。公开版已经把所有页面和服务端操作都放在 `requireUser()` 后面校验，不依赖 `proxy.ts`，出现这个问题时移除 `src/proxy.ts` 再重新部署即可。

## 维护

- 以后更新公开版，把修改推送到 `codex/edgeone-deploy`，EdgeOne 会自动部署。
- `main` 与 `codex/edgeone-deploy` 保持同一版，仓库首页直接展示 v2.5。
- DeepSeek API Key 和数据库密码只放在 EdgeOne 环境变量里，不提交到 GitHub。
- `AUTH_SECRET` 不要改得太频繁，否则已登录用户会需要重新登录。
