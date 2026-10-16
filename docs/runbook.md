# 运行手册（现行）

> 本地预览、部署、小程序、数据库、排障。本机的绝对路径和数据库主机名见 [`private/local.md`](./private/local.md)（仅本地，不提交）。

## 本地预览

### 唯一标准流程

1. 需要给人看 UI 时，**优先让用户自己在终端跑 `pnpm dev` 并保持窗口开着**。这是唯一不依赖助手会话的可靠方式；助手起的后台服务只能算尽力而为，要在回复里说清这一点。
2. 助手要起后台服务时，用独立后台进程（PowerShell，工作目录 = 项目根），不要在前台跑：

   ```powershell
   Start-Process -FilePath "node" `
     -ArgumentList @("node_modules/next/dist/bin/next","dev","-p","3000") `
     -WorkingDirectory "<项目根>" -WindowStyle Hidden `
     -RedirectStandardOutput "<项目根>\.next-dev-3000.out.log" `
     -RedirectStandardError "<项目根>\.next-dev-3000.err.log"
   ```

3. 端口被占用就改 3001 / 3002，并把新端口告诉用户。
4. **给用户任何本地地址之前，当场重新探测一次**：端口在监听 + HTTP 返回 200 + 用无头浏览器渲染确认不是白屏。上一轮验证过不算数，后台进程会随会话被回收。
5. 给地址时同时说明停服 / 重启方式。同一局域网可用 `http://<本机IP>:3000`。建议同时用 `open_in_codex` 打开应用内浏览器标签，比让用户手敲地址可靠。

### 排障顺序

1. `Get-NetTCPConnection -LocalPort 3000 -State Listen` 确认监听。
2. 看 `.next-dev-3000.out.log` / `.next-dev-3000.err.log`。
3. 用户说「打不开」时先查这三件事：端口是否在监听、进程是否还在、HTTP 探测结果。查明原因再回复，不要重复给同一个地址。

### 守护进程（会抢 3000 端口）

`scripts/start-public-service.ps1` 每 10 秒检查一次 3000 端口，发现没监听就自动拉起 `next start -H 0.0.0.0 -p 3000`，同时起一个 cloudflared 隧道（`tools/cloudflared.exe`）。日志在 `.public-service/`，隧道地址写在 `.public-service/tunnel.url`。

- 它和开头的后台 `next dev` 会抢同一个 3000 端口，这两套不要同时开。
- **在守护运行期间做 `next build` 会被它抢先起服务**：构建还没落盘它就拉了 `next start`，页面会一直跑旧代码，看起来像「改动没生效」。
- 正确的构建顺序：先停守护（命令行含 `start-public-service` 的 powershell 进程）→ 停本项目所有 `next` 进程 → `next build` → 等 `.next` 产物 mtime 稳定 → 再重新拉起守护。
- 判断改动是否生效**不要看 BUILD_ID 时间**，直接看页面里的新文案。
- 重构后必须确认服务进程晚于 build：`next build` 完成后旧的 `next start` 可能还在跑旧 manifest，症状是页面 HTML 正常但 `/_next/static/css/*.css` 返回 404、整页无样式。先停掉所有本项目 `next start`，再重启；进程 `CreationDate` 应晚于 `.next/BUILD_ID` 的更新时间。
- `scripts/start-public-demo.ps1` 是 SQLite 阶段的脚本，内部已有失效守卫，不要使用。

## 部署（EdgeOne Pages）

- 正式域名：`https://nextstep9.work`（响应头 `server: edgeone makers`）。给用户分享 / 验收一律用这个域名，不要用 trycloudflare 临时隧道地址。
- 提交后**必须同时把 `codex/edgeone-deploy` 和 `main` 推到同一个提交**。EdgeOne 实际跟随 `main`，只推 `codex/edgeone-deploy` 可能不触发发布。见「提交规则」。
- EdgeOne 自动跑 `npm run build:edgeone` = `prisma generate && prisma migrate deploy && next build`。
- 生产部署只用 EdgeOne Pages，仓库不保留 Vercel 配置。GitHub Deployments 里若还出现 Vercel Preview，来自已安装的 Vercel GitHub App，要在 GitHub / Vercel 侧断开集成。
- **环境变量只在构建时注入**：必须先保存 `DATABASE_URL` / `DIRECT_URL` 等环境变量，再触发一次新的部署。先 Redeploy 后改环境变量，那次部署用的还是旧值。

### 发布窗口的无样式问题

- 发布期间会短暂出现「新 HTML 已生效、`/_next/static/*` 还没就绪」的无样式窗口（页面只剩裸 HTML + 巨大的 BrandMark SVG）。这是中间态，不是代码或浏览器问题。判断方法：抓页面 HTML 里 CSS 的 `href` 再请求一次，看是否 `200 + text/css`；带任意查询串请求（例如 `...css?asset-retry=1`）返回 200 即资源就绪，仍 404 说明还在发布窗口内。
- 机制：EdgeOne 发布时先切 HTML、后补静态资源。窗口内请求会拿到 404，而这个 404 带 `Cache-Control: public, max-age=31536000, immutable`，会被浏览器缓存住，普通刷新仍命中那份缓存的 404，只有强刷（Ctrl+Shift+R）或无痕窗口才恢复。
- 三层防御在 `src/lib/asset-guard.ts` + `src/app/layout.tsx` + `src/components/brand-mark.tsx`：① 内联守卫脚本检测样式表是否真的生效，没生效就用 `?asset-retry=<时间戳>` 重拉（对 404 的 `/_next/static/*` 脚本同样补拉）；② 失败期间给 `<html>` 打 `data-asset-degraded="1"` 启用极简兜底样式；③ BrandMark 内联 SVG 用固有尺寸 + 百分比宽高，样式表挂掉时只是小图标而不是撑爆整屏的色块。**这三层不要删。**
- 生产 CSS 由 EdgeOne 构建产出（Tailwind v4）；`@layer` 仍在，但 `oklch()` 会被降级成 rgb/hex，桌面现代浏览器正常，只有不支持 `@layer` 的极老浏览器才会整页无样式。

### Web 鉴权

- Web 登录 / 注册**不能依赖 Next Server Action**：EdgeOne 在无 JS 的静态降级 POST 下会返回 500。统一走 `/api/auth/login`、`/api/auth/register` 的 Route Handler，并保留原生 `method="post"` 表单兜底。
- 注册 / 登录是合并入口：新用户名（密码不少于 6 位）自动注册；同名账号只校验密码。密码错误时明确提示「该用户名已注册，请输入第一次设置的密码」，不要显示笼统的「用户名或密码不正确」。

## 小程序上传与发布

- 开发者工具的安装路径、小程序目录、appid 见 [`private/local.md`](./private/local.md)。
- 用之前先确认登录：`cli.bat islogin` 返回 `{"login":true}`。没登录要让用户扫码，agent 代不了。
- **版本号只是上传时手填的标签，不代表包里的代码**：后台显示「线上版本 3.5.0」不等于线上跑的就是那版代码。判断内容对不对，只看真机 / 预览里的实际页面（底部署名），别拿版本号当证据。
- **上传 ≠ 上线**：`cli upload` 只把代码传到微信后台的「开发版本」。用户真正用到，还要去 https://mp.weixin.qq.com → 管理 → 版本管理 → 提交审核 → 审核通过后发布。提交审核和发布只有网页后台能做，CLI 没有对应命令。别把「改了代码」当成「已上线」回复用户。
- **必须用 PowerShell 直接调 CLI，不要用 `cmd /c`**：`cmd /c` 会传坏路径里的中文和全角括号，报 `local path is invalid or not allowed (code 10)`。
- 上传前确认 `miniprogram/config.js` 的 `apiBase` 指向线上域名。一条命令上传：

  ```powershell
  & "<微信开发者工具>\cli.bat" upload --project "<仓库>\miniprogram" -v <版本号> -d "<描述>"
  ```

- 立刻出真机预览二维码（不用等审核）：

  ```powershell
  & "<微信开发者工具>\cli.bat" preview --project "<仓库>\miniprogram" --qr-output "<输出.png>" --qr-format image
  ```

  把二维码发给用户扫，这是最快验证「改动到底生效没有」的方式。
- 发布后验证：让用户在小程序列表里**删掉「走走」再重新进入**（小程序有缓存），确认底部署名。
- 包体积：主包上限 2MB（曾因整屏 PNG 达到 2.11MB 而无法上传，换成同尺寸 JPEG 后降到 395.3KB）。往 `miniprogram/` 加资源要盯体量，别再放整屏 PNG。
- 小程序登录 / 注册同样走合并入口 `/api/miniprogram/auth/login`：已存在则校验登录（允许旧账号短密码），不存在且密码不少于 6 位则自动注册。客户端不要看到 401 就再调 register，否则密码错误会被误报成用户名已存在。

### request 合法域名与备案

- 小程序真机 `wx.request` 只允许已 ICP 备案的 request 合法域名；`nextstep9.work` 未备案，不能直接用于 `wx.request`（`urlCheck:false` 只对开发者工具有效）。
- 未备案时的替代方案已预留在 `miniprogram/cloudfunctions/apiProxy`：开通微信云开发并创建环境后，把环境 ID 填到 `miniprogram/config.js` 的 `cloudEnv`，小程序 API 请求会自动改走 `wx.cloud.callFunction`，云函数再请求 `https://nextstep9.work`。
- 网络失败要显示微信返回的 `errMsg`，不能落成「用户名或密码不对」。
- `.WORK` 后缀在工信部批复名单内（可以备案），注册商是 DNSPod（境内有资质），不需要域名转移。
- **首次备案期间域名不能有任何解析**：提交备案前删掉 DNSPod 上 `nextstep9.work` 与 `www` 的 CNAME，备案通过后再加回。EdgeOne 默认域名在中国大陆返回 401，不能当过渡入口——这段时间网站是真的打不开。
- 备案要人脸核验 + 短信核验，只能用户本人做；微信侧的小程序备案是独立流程，同理。
- 完整操作手册见 [`beian-launch-runbook.md`](./beian-launch-runbook.md)。

## 数据库（Neon Postgres）

- 连接串在 `.env` 的 `DATABASE_URL`；当前区域 `ap-southeast-1`（新加坡），历史主机名和项目 id 见 [`private/local.md`](./private/local.md)。
- 冷启动偶发 `terminating connection due to administrator command`：属环境问题，不是代码 bug；登录 / 注册等写库操作偶尔需要重试。
- 任务确认保存走 interactive transaction，**必须用 `withTransactionRetry`**。Prisma 默认 5 秒事务超时会在 Neon 抖动时直接报 `P2028`，不能把这种失败伪装成「保存按钮没反应」。
- 常用命令：`pnpm db:generate`、`pnpm db:migrate`、`pnpm db:migrate:deploy`、`pnpm db:backup`、`pnpm db:verify:restore`（+ `:fixture` 用 PGlite 跑离线往返）、`pnpm db:studio`。
- 缓存失效：`invalidateAiContext(userId)` 必须挂在所有会改变「项目 / 任务 / 复盘 / 偏好 / 反馈」的写入路径上（已接确认计划、`setTaskStatus`、`saveReview`）。注意别把失效写在 `return` 之后（写成死代码过一次）。细节见 [`perf.md`](./perf.md)。
- 搬迁 / 大批量改数据后，跑 `scripts/bench-migrate-verify.mjs` 做新旧库关系完整性对拍（不只比行数）。
- `scripts/db-copy.mjs` 里 `projects` ↔ `inbox_items` 是循环外键：写 project 时先置空 `createdFromInboxItemId`，写完 inbox_items 再逐条回填并校验。**改这个脚本时别把这步删了。** `scripts/restore-db.mjs` 是另一份同类实现，两边都要保持正确。
- 验证线上到底连哪个库（不要靠感觉）：用 `POST https://nextstep9.work/api/auth/register` 注册一个带时间戳的标记账号 → 分别查新旧两个库的 `user.count` → 出现在新库说明已切。跑完把标记账号删掉，两个库都确认无残留。

## 排障速查

| 症状 | 先看 |
| --- | --- |
| 本地链接打不开 | 端口监听 → 进程是否还在 → HTTP 探测结果 |
| 页面 HTML 正常但整页无样式 | 是不是发布窗口；`/_next/static/css/*.css` 是否 404；服务进程是否晚于 build |
| 改了代码但页面没变 | 守护进程是否在跑；是不是 `next start` 读了旧 manifest；看页面文案而不是 BUILD_ID |
| 线上是旧版本 | `main` 和 `codex/edgeone-deploy` 是否都推到了同一个提交 |
| 环境变量改了不生效 | 是否先保存环境变量、再触发新部署 |
| AI 按钮一直「处理中」 | `callModel` 时间预算（总 26s / 单次 20s）与 pending 清理 |
| 写库偶发失败 | Neon 冷启动抖动；确认写路径用了 `withTransactionRetry` |
| `pnpm lint` 报几百个 error | 报错文件是不是都在 `.chrome-headless-profile/` / `.edge-headless-profile/`（本机浏览器配置目录，没被 `eslint.config.mjs` 的 `globalIgnores` 覆盖）。只跑 `eslint src scripts` 是 0 error，说明代码本身干净 |
