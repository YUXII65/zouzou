<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 本地预览（跨会话记忆，勿删）

> 用户已多次遇到「本地链接打不开」。需要给用户看 UI 效果时，必须保证服务在**会话结束后仍可用**，不要只在会话内前台运行。

- 启动方式：用独立后台进程（PowerShell，工作目录 = 项目根）：

  ```powershell
  Start-Process -FilePath "node" `
    -ArgumentList @("node_modules/next/dist/bin/next","dev","-p","3000") `
    -WorkingDirectory "<项目根>" -WindowStyle Hidden `
    -RedirectStandardOutput "<项目根>\.next-dev-3000.out.log" `
    -RedirectStandardError "<项目根>\.next-dev-3000.err.log"
  ```

- 链接：`http://localhost:3000`（同一局域网可用 `http://<本机IP>:3000`）。给用户链接时同时说明停服/重启方式。
- 端口占用时改 3001/3002 等，并把新链接告诉用户。
- 排障顺序：`Get-NetTCPConnection -LocalPort 3000 -State Listen` 确认监听 → 看 `.next-dev-3000.out.log` / `.next-dev-3000.err.log`。
- **重构后必须确认进程晚于 build**：`next build` 完成后，旧的 `next start` 进程可能仍在运行并读取旧 manifest，表现为页面 HTML 正常但 `/_next/static/css/*.css` 返回 404、整页无样式。先停止所有本项目 `next start` 进程，再重新启动；检查进程 `CreationDate` 应晚于 `.next/BUILD_ID` 的更新时间。
- 数据库是 Neon Postgres（`.env` 的 `DATABASE_URL`）：冷启动偶发 `terminating connection due to administrator command`，属环境问题不是代码 bug；登录/注册等写库操作偶尔需重试。

# 产品取舍（跨会话记忆，勿删）

- 界面不强调 token / 成本消耗：用户明确说过「这个项目并不追求花多少 token」。首页不要做「今日 AI 用量 / token / 剩余次数」这类消耗看板（已于 2026-09-11 移除 `AiUsageCard`）。
- AI 用量只作为后台配额与降级逻辑存在（`src/lib/ai-quota.ts` 的 `AI_QUOTA_*`），不作为卖点或用户可见指标。若将来需要提示配额，只允许在「快用完」时给一行极轻的提醒，不做数字看板。
- 界面少用解释性小字：页面标题下、步骤标题下、账号资料里的说明文案默认删掉；能用「写想法 / 谈感受 / 建项目 / 定今日」这类短标题表达，就不要补一句解释。
- 左侧栏下半部分固定顺序：工具匣 → 模式切换 → 用户；退出登录只放在用户菜单里。
- 任务行外层显示 AI 理解任务动作、对象和场景后生成的 `shortTitle`，不能直接截取完整标题；用户可在任务编辑里确认，旧任务缺失时自动补齐。点击标题展开完整任务内容，不再使用悬停气泡。
- 便利贴支持持久化多张叠放，单任务最多 10 张；未生成时悬停只显示「你有什么想法补充」输入框，展开面板底部也只保留同一输入框。单张便利贴再次点击可收起，关闭面板不能删除内容。
- 新用户引导第 3 步文案固定为：标题「使用便利贴」，正文「点一下【便利贴】，AI 会为你写一张详细执行步骤。你也可以补充自己的想法或卡点。」
- 复盘保存时，后续任务要自动归入对应项目，不能继续堆进「未关联任务」。
- 首页首屏的快速记录是招牌入口，输入区要保持大、醒目，CTA 统一叫「下一步」；面板不再重复显示「今日推进伙伴」标题。
- 落地页演示保留 5 个不同处境（工具过载 / 关系沟通 / 创作选择 / 时间诊断 / 复杂活动），首次进入随机选一版；不展示场景标签，只在右下角提供「换一个演示」。演示输入用自然两行展示，计划页不显示「当前里程碑 / 这次先不做」。自动播放中点击步骤会暂停，暂停后点击演示区域任意位置恢复播放。不要再把演示收成单一故事，也不要重新加回「它是怎么运转的」或「看 30 秒演示」。
- 打卡信息（连续天数、近 7 天完成数）放在顶部日期面板里，不再单独保留「你的推进闭环」卡。
- 工具页的状态统计卡要使用对应色系：待整理偏警示色、未完成偏主色、已完成偏成功色、复盘偏 AI 色。
- 注册优先，游客是兜底体验：主 CTA 默认引导注册；创建游客账号前必须二次确认并说明「只在本机保存」。游客转正后回到应用，不重复跑一遍 onboarding。
- 手机号验证尚未完成前，落地页不显示游客体验入口；`GuestStartButton` 和游客流程保留在代码里，只是暂不展示。注册 / 登录是合并入口：账号存在则直接登录，不存在则用当前用户名和密码创建账号并进入欢迎页。
- 新人引导由服务端 `first_run_tour` 驱动，跨首页和工作台共 3 步：记录想法 → 任务下一步 → 便利贴。跳过大流程时不能把引导一起关掉。
- 关闭「把任务推起来」引导后要直接进入便利贴引导；首个任务完成后不跳转复盘页，而是在书桌显示锚定提示。引导采用双重判定：前端任务完成事件立即触发，服务端在「已有完成任务且尚无复盘」时兜底显示。固定文案：标题「抽屉复盘」，正文「你的第一项任务已完成。点左侧【抽屉】，用复盘留下今天的判断和明天的方向。」
- 复盘生成的下一步任务保留 1-3 条，每条两行：第一行精简标题，第二行具体说明。任务行显示精简标题，展开后显示完整内容；不显示序号或竖线。
- 所有异步按钮和 AI 操作结束后必须可靠清除 loading/pending 状态，不能在响应完成后继续显示「处理中」。`SubmitButton` 在 pending 结束后主动 `router.refresh()`，并在 pending 时于主按钮旁显示一个小刷新按钮用于手动重新加载；复盘生成和保存 action 完成后重定向回对应日期。
- 首页顶部日期面板：日期和时钟放左侧，打卡（连续天数、近 7 天完成数）与进度条放右侧。
- 登录页（`/login`）背景统一用 `src/components/halftone-spiral.tsx` 的蓝色半调螺旋：两组阿基米德螺旋叠加后把波值映射成圆点半径与蓝度，越靠近中心的表单越淡。配色从主题变量 `--accent / --surface` 读取，改主题色不用改组件。
- 这个背景的动态**只能靠 CSS rotate 实现**（`@keyframes zouzou-spiral-drift`），因为两组螺旋相位都含 θ 项，整体旋转等价于同时推移两个相位，视觉上和逐帧重算完全一致。纹理只在挂载时画一次，之后 0 主线程开销、GPU 合成器跑，实测 8 秒内 main-thread 任务约 15ms（≈0% 单核）。**不要改回逐帧重绘 canvas**，那样会回到 8-10% 单核占用。
- 画布必须按视口放大（`ZOOM = 1.45`）并居中，否则旋转到 45° 时四角会露出底色。不要再往登录页加别的背景图或铺底渐变，也不要把它换成静态图片。
- 登录页背景的当前参数（用户逐条确认过）：`TWIST_A = 3.6`、`TWIST_B = -2.8`、`FREQ_A = 36`、`FREQ_B = 20`（弧度密度越大、扭转越强，螺纹越密），旋转周期 `40s`。
- 中心光晕（veil）的半径必须取画布对角线的 0.575 倍、且最外层颜色 stop 为完全透明。之前半径只取画布一半，渐变在画布内部就被截断，旋转时会看到一圈突兀的硬"接头"。同样原因，`/login` 容器底色要用 `bg-background`，不能硬编码近似色。

- 页面底部保留「走走 v2.5 · Coded by 氵」署名；用户当前已完成任务数 ≥ 3 时，在署名旁显示「有改进意见？十分感谢！」入口。反馈写入 `usage_events` 的 `product_feedback` 事件，不新增数据库表。
# 任务尺度与输出质量（V2.5，跨会话记忆，勿删）

- 每条任务都要有「怎么做」的合同，落在 `tasks` 表的 `executionMode / doneWhen / maxTurns / toolPolicy` 字段上（见 `src/lib/task-contract.ts`）。`executionMode` 取 quick / tool / produce / explore / project；`maxTurns` 为 quick=1、tool/produce=2、explore/project=3；`toolPolicy` 取 none / read / confirm-write。
- 小任务不要工程化：quick 任务一轮结束，不再追问、不再拆下一层。只有长期目标才用 project，且一轮只推进当前阶段，不自动生成无穷尽的后续任务。
- `src/lib/tool-router.ts` 决定要不要借助外部工具：最新信息/价格/政策 → 联网搜索；用户给了网址 → 读页面；GitHub/仓库 → 查仓库；API/文档 → 查文档；发布/注册/购买等写操作 → 只提示需要确认，不能自己执行。
- 目标和里程碑必须具体到对象、范围、可检查的结果，禁止「初版」「最小一步」「先确认方向」「核心方向」「现实限制」这类空泛说法。任务标题要写清今天能动手的具体动作，`shortTitle` 必须是理解动作、对象、场景后的重新概括，不能截取原文开头。
- AI 输出不要在每轮开头先肯定用户，不要复用「我大概知道你真正看重什么了」「接下来不再套标准流程」「先做最小下一步」「不是 A 而是 B」这类模板句，也不要把用户最后选的选项原样复述一遍当作理解。全局约束在 `src/lib/ai.ts` 的 `OUTPUT_QUALITY_RULES`，禁止删除。
- 复盘生成的下一步任务要精炼：每条两行（精简标题 + 具体说明），具体内容放进任务正文里展开，不标序号、不写竖线。任务标题生成好再上屏，不能让用户看到「先有正文再总结标题」的过程。
- `callModel` 必须有总时间预算（当前 26 秒上限，单次 20 秒），任何 AI 请求都不能让按钮无限停在「处理中」。

# 线上部署（跨会话记忆，勿删）

- 正式线上域名：`https://nextstep9.work`（EdgeOne Pages，响应头 `server: edgeone makers`）。给用户分享/验收一律用这个域名，不要用 trycloudflare 临时隧道地址。
- 部署方式：提交并 `git push origin codex/edgeone-deploy`，EdgeOne 自动跑 `npm run build:edgeone`（= prisma generate && prisma migrate deploy && next build）。仓库：`YUXII65/zouzou`。
- 生产部署只使用 EdgeOne Pages，仓库不保留 Vercel 配置。GitHub Deployments 里若仍出现 Vercel Preview，来自已安装的 Vercel GitHub App，需要在 GitHub/Vercel 侧断开集成。
- 部署期间会短暂出现「新 HTML 已生效、`/_next/static/*` 还没就绪」的无样式窗口（页面只剩裸 HTML + 巨大的 BrandMark SVG）。这是部署中间态，不是代码或浏览器问题；刷新即可恢复。
- 判断是否仍处于中间态：抓页面 HTML 里 `href` 的 CSS 地址，再请求它，看是否 `200 + text/css`；同时用 `匹配关键文案` 确认线上是否已是新版。
- 生产 CSS 由 EdgeOne 构建产出（Tailwind v4，`@layer` 仍在，但 `oklch()` 会被降级为 rgb/hex），因此桌面现代浏览器正常；只有不支持 `@layer` 的极老浏览器才会整页无样式。

# 掉链子根因（2026-09-12 实测，跨会话记忆，勿删）

- **现象**：新版本上线后打开网站，页面完全没有样式（只剩裸 HTML + 巨大的 BrandMark 箭头色块），刷新也不好。
- **机制**：EdgeOne Pages 发布时先切 HTML、后补 `/_next/static/*`。发布窗口内请求这些资源会拿到 **404**，而这个 404 带着 `Cache-Control: public, max-age=31536000, immutable`，会被浏览器缓存住。等资源补齐后，普通刷新仍命中那份缓存的 404 —— 所以页面会“坏很久”，只有强刷（Ctrl+Shift+R）或换无痕窗口才恢复。
- **已做的三层防御**（`src/lib/asset-guard.ts` + `src/app/layout.tsx` + `src/components/brand-mark.tsx`）：
  1. 内联守卫脚本（不依赖 `/_next/static/*`，所以它是发布窗口里唯一一定能跑起来的 JS）：检测样式表是否真的生效，没生效就用 `?asset-retry=<时间戳>` 重新拉取，绕开被缓存的 404；对 404 的 `/_next/static/*` 脚本同样补拉。
  2. 兜底样式：失败期间给 `<html>` 打 `data-asset-degraded="1"`，启用一份极简可读样式，不参与正常加载。
  3. BrandMark 的内联 SVG 改成「固有尺寸 64 + `h-[58%] w-[58%]`」，不再用内联百分比 `style`；样式表挂掉时它只会是一枚小图标，而不是撑爆整屏的色块。
- **验证方式**（复现脚本在 `%TEMP%\asset-guard-check`）：用带 immutable 头的 404 模拟发布窗口，无头 Chrome 对照——无守卫时第二次打开仍然是无样式，带守卫时自动恢复成有样式。
- **发布后自检**：抓首页 HTML 里的 CSS 地址并带任意查询串请求一次（例如 `...css?asset-retry=1`），返回 `200 + text/css` 即为资源就绪；若仍是 404，说明还在发布窗口内，等十几秒再看。

# 新人引导设计（2026-09-12 定稿，跨会话记忆，勿删）

- **入口原则**：落地页主 CTA「立即体验 · 免注册」直接触发 `startGuestExperience` 进真产品；`/onboarding` 只是演示，降级为次级按钮「看 30 秒演示」。用户在哪写过想法，就往哪继续，不要把演示和真流程串成"写两遍"。
- **想法传递**：演示页/落地页写的那句话用 `src/lib/pending-idea.ts`（localStorage `next_step_pending_idea`）带到 `/welcome` 预填。
- **新手态必须服务端判定**：`src/lib/first-run.ts` 用 `UserPreference(first_run_tour)` + 「注册 14 天内 + 项目 ≤ 1 + 任务 ≤ 3」判定，别再依赖 localStorage `next_step_new_user`（那条路径极脆：只在 /welcome 挂载时写一次）。
- **三步锚定引导**：`src/components/first-run-tour.tsx` + `anchored-hint.tsx`。目标元素用 `data-tour` 标记（`task-next` / `task-sticky` / `bottom-nav` / `side-nav` / `guest-banner`）。第 1 步点「下一步」后进入第 2 步，完成首个任务进入第 3 步；不做全屏蒙层聚光灯（滚动/移动端易错位）。
- **游客态必须常驻可见**：`GuestBanner`（layout 渲染）说明"内容只保存在这台浏览器，注册后可长期保存"。游客账号是随机用户名 + 随机密码且从不展示，会话 30 天，不提醒就是无声数据丢失。
- **新手期图标展开文字**：任务行三个图标（拆成小步 / 设置 / 问 AI）通过 `showLabels` 在新手期展开，引导结束后自动收起。
- **落点统一**：注册、游客转正、跳过引导后都落 `/workspace`（`welcome/page.tsx` 的 redirect 已改）。
- **首页取舍**：AI 设置（API 连接 / 执行偏好）收进「今日推进伙伴」面板底部的折叠区，第一屏留给"记想法 + 今天做什么"。
- **待办（未做）**：日历/抽屉/工具页的锚定气泡目前仍是 PageHint 角落卡片（已由服务端新手态 gate）；若要继续收敛，按同一套 `data-tour` + AnchoredHint 改造。

# 账号资料与页面框架（2026-09-12，跨会话记忆，勿删）

- **角落的账号资料**：`src/components/profile-card.tsx`（头像 + 昵称 + 改/取消）。桌面在左侧栏底部、移动端在顶栏右侧，由 `Sidebar` 的 `user` prop 传入（来源是 `layout.tsx` 的 `getCurrentUser()`）。
- **头像存储方式**：不做对象存储。浏览器端用 canvas 压成 192×192 JPEG 的 data URL（约 10-30KB）存进 `users.avatarUrl`；服务端 `updateUserProfile` 只接受 `data:image/` 且 ≤400KB，否则丢弃。换头像的入口就是那张资料卡（无需新页面）。
- **营销页必须隔离应用框架**：`/landing`、`/login`、`/onboarding`、`/welcome`、`/guest/register` 通过 `src/components/app-chrome.tsx` 的 `FULLSCREEN_ROUTES` 完全不渲染 Sidebar / CommandPalette。历史坑：这些页面用 `fixed inset-0 z-40` 覆盖，但容器是透明的，z-30 的侧栏/底部导航会透出来，落地页左上角出现两个 logo 重叠。
- **改这些页面的路径时**：新增整屏页面记得同时加进 `FULLSCREEN_ROUTES`，否则又会露出侧栏。
