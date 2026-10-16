# 未决与待办

> 只放「文档里说法冲突、无法用代码或日期判定」和「已经决定但还没做」的事。拍板之后：现行规则进对应文档，历史进 [`decisions-log.md`](./decisions-log.md)。

## 待拍板

### 1. 首页输入框宽度

- 冲突：《产品取舍》一节写「卡片最宽 `max-w-3xl`」，《v3.4 三页细节调整》一节写「与『今天要做』面板同宽、**不要** `max-w-3xl`」。两条同一天写进文档，日期无法区分先后。
- 当前事实：代码里没有 `max-w-3xl`。`src/app/page.tsx` 用 `<Panel>` 包 `AiTaskPlanner`，`quick-capture.tsx` 是 `w-full min-h-44`，布局容器是 `max-w-5xl`，所以渲染出来就是与面板同宽。
- 需要你定：保持现状（与面板同宽），还是改回限制 `max-w-3xl`。改的话要同时改代码和本文档。

### 2. 首组任务的「抽屉复盘」引导往哪落

- 现状：首组任务收尾后要提示用户去复盘，文案是「抽屉复盘 / 点左侧【抽屉】」。但 `/tools`（抽屉）已退役、`/workspace` 也只是 302 到 `/files`，这条引导指向不存在的入口；按天复盘目前也没有入口。
- 需要你定：撤销这条引导，还是给复盘重新挂一个入口（首页 / 探索模式 / 文件页）。

## 已知未完成（已决定怎么做，只是还没做）

- 探索线路的接线：任务行还没显示所属线路标签；AI context / 今日建议 / 复盘还没读线路信息。线路本身（`project_tracks` + `Task.trackId` + 线路图）已经落地。
- 小程序的未备案通道：`miniprogram/cloudfunctions/apiProxy` 已就位，等微信云开发环境开通后把环境 ID 填进 `miniprogram/config.js` 的 `cloudEnv`（本机记录见 [`private/local.md`](./private/local.md)）。
- pnpm lint 目前必然失败（425 error / 25768 warning），来源是本机浏览器配置目录 .chrome-headless-profile/、.edge-headless-profile/ 没进 slint.config.mjs 的 globalIgnores。代码本身干净（slint src scripts 是 0 error）。要修就在 globalIgnores 里补这两条。
