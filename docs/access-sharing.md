# 让别人访问当前项目

> **本文已过时（SQLite 阶段文档）**
>
> 数据库现在是 Neon Postgres，公开部署走 EdgeOne（见 [docs/deploy-edgeone.md](./deploy-edgeone.md)）。
> 文中出现的 `DATABASE_URL="file:./dev.db"`、`prisma/dev.db` 都已失效 ——
> Prisma 会直接拒绝 `file:` 连接串（必须以 `postgresql://` 开头）。
> `APP_ACCESS_PASSWORD` 也已在应用代码里没有任何地方读取，"访问密码"从来没有生效过。
> 保留本文只为追溯历史。


> 当前版本是本地单用户 SQLite 应用，共享访问前先理解安全边界。

## 一、同一局域网访问

这是最适合当前测试阶段的方式。

访问地址：

```text
http://192.168.0.104:3000
```

要求：

- 访问者和你的电脑连接同一个 Wi-Fi 或局域网
- 访问者知道登录密码
- 如果访问者打不开，检查 Windows 防火墙是否允许 Node.js 或 3000 端口入站

当前登录密码来自：

```env
APP_ACCESS_PASSWORD=123456
```

## 二、临时外网访问

当前已开启临时公网地址：

```text
https://browse-baltimore-williams-customise.trycloudflare.com
```

不需要和你的电脑连同一个网络，直接发给对方即可。对方打开后输入当前登录密码。

当前访问由守护脚本自动维持：

- 服务脚本：`scripts/start-public-service.ps1`
- 服务日志：`.public-service/`
- 当前公网地址文件：`.public-service/tunnel.url`
- 登录启动快捷方式：`AI-Workbench-Public.lnk`

电脑重新登录后会自动拉起，隧道断开后也会自动重连。

如果 Cloudflare 重新生成地址，最新地址会写在 `.public-service/tunnel.url`。

如果链接失效，可以重新启动隧道：

```bash
tools\cloudflared.exe tunnel --url http://localhost:3000 --protocol http2 --no-autoupdate
```

也可以换用其他内网穿透工具，例如：

- ngrok
- Cloudflare Tunnel
- localtunnel

示例：

```bash
ngrok http 3000
```

拿到 `https://xxxx.ngrok-free.app` 后发给访问者。

注意：

- 临时外网访问只适合短时间测试
- 每次电脑关机或工具退出，链接可能失效
- 建议测试结束后立即关闭穿透

## 三、正式部署给别人用

当前项目不推荐直接开放公网长期使用，原因：

- 使用 SQLite，多个实例和并发写存在风险
- 目前是单用户数据模型，所有人共享同一份项目、任务、复盘
- API Key 等配置需要谨慎处理

如果要正式给多人长期使用，下一步应该：

1. 从 SQLite 迁移到 PostgreSQL
2. 增加真正的账号、登录和用户隔离
3. 将 AI API Key 放到服务端配置
4. 部署到支持 HTTPS 的服务器

## 四、当前最安全的分享方式

目前建议：

- 同局域网访问
- 只发给少量可信测试者
- 使用同一个登录密码
- 测试完后及时清理测试数据
