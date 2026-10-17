# AI 链路：翻译 → 方案（现行）

> 管 `src/lib/agent-plan/`、`src/lib/inbox-ai.ts`、`src/lib/ai.ts`、`src/lib/ai-prompts.ts`。
> 只写现在生效的规则；被推翻的版本见 [`decisions-log.md`](./decisions-log.md)。

## 链路总览

- 输出逻辑固定为一条两段 Agent 链：**翻译 → 方案**。任何输入（想法、思绪、随便什么）都走同一条链。生成计划主链在需要外部事实时调用 DeepSeek Search / Fetch；搜索结果作为 `webEvidence` 进入方案 Agent，搜索失败不能假装已查。
- 第 1 段翻译 Agent（`translateIdea`）：用户原话 → 结构化 `translation`（`desiredOutcome` / `workingAssumption` / `ifWrongThen`），同时给 `readiness` 和 `responseMode`。**提问也由这一段负责**。
- 第 2 段方案 Agent（`buildPlanAgentSystemPrompt(workMode)`）：基于翻译、澄清事实和上下文，按普通 / 长期 / 探索三种模式追加各自的专项规则，直接产出唯一执行路径、行动卡和任务，填全每条任务的执行合同字段。共享骨架和输出合同只有一份，模式差异只放在 `PLAN_AGENT_MODE_PROMPTS`。
- 两段都用用户传入的 DeepSeek `apiKey` / `model` / `baseUrl`。
- 旧的三段链（`CONTENT_GENERATION_SYSTEM_PROMPT` + `NORMAL_COMPOSE_SYSTEM_PROMPT_V1`）只作为失败回退保留；`TWO_STAGE_AGENT_PLAN=false` 才显式切回。
- `NORMAL_AGENT_PLAN=false` 关闭 Agent 链、回退旧 `planInbox`；`CONTENT_AGENT_PLAN=false` 只影响旧链回退。
- 用户最终只看到一张行动卡（理解 / 先做 / 怎么做 / 完成标准），看不到候选方案、评分、A/B 或「看情况自己决定」。
- `InboxPlan.source` 区分 `model` / `heuristic_fallback` / `agent_failed`；后两者不得自动确认落库，必须让用户能重试。
- 方案审计只做重试和警告。不能因为审计未通过就直接给用户 `agent_failed`。
- 主要代码在 `src/lib/agent-plan/`，生产接入点是 `src/lib/inbox-ai.ts` 的 `createInboxPlan`。

### 已删除，不要加回

- 旧问卷式澄清（`clarifyInbox` / `createInboxClarification`）
- 苏格拉底提问段（`SOCRATIC_CLARIFY_SYSTEM_PROMPT`）
- 理解 Agent（`NORMAL_BRIEF_SYSTEM_PROMPT`）
- `ANSWER_MODE_ENABLED` 开关（它同时承担「允许直答」和「切回旧链」两个互相打架的职责）
- 直接回答出口（`answer` / `DIRECT_ANSWER_SYSTEM_PROMPT` / `generateDirectAnswer` / `createDirectAnswerPlan`）
- 首页模式选择器（`mode-picker.tsx`）

## 没有直接回答出口

- `responseMode` 只有 action / plan，由第 1 段翻译 Agent 判，**没有默认项**。2026-10-16 起 answer 出口已移除：知识、事实、比较、推荐、判断类输入也按 action / plan 处理，落到一个能验收的动作或计划上。
- 任何输入首轮都必须澄清，不再有「answer 不受至少两轮约束」的豁免。
- `generateDirectAnswer` / `DIRECT_ANSWER_SYSTEM_PROMPT` / `createDirectAnswerPlan` 已删除；`InboxPlanResponseMode` 与 confirm / UI 里的 `answer` 分支只为读取历史数据保留，不要在新链路里产生 answer。

## 澄清规则

### 轮数与时序

- 代码层保证**最少 2 轮、最多 4 轮**：`generateSocraticClarification` 把 `maxQuestions` 夹在 ≤4（调用方传 4），`minQuestions` 默认 2，`inbox-ai.ts` 显式传 2；到上限无论 readiness 如何都往下走。
- `answeredCount === 0` 时 `question` 必须非空（模型没给就用本地兜底），返回 `status: "asking"`；用户答过一次且 `readiness === "ready"` 时才允许 `question` 为 null。
- 低风险、可默认完成的小任务也至少问满两轮，之后没有新的关键未知点再收口。
- 模式在**澄清收口之后、生成之前**由独立的 `judgeWorkMode`（`src/lib/ai.ts`）判定。完整的 `WorkModeJudgment`（mode / confidence / frame / decisiveEvidence / fallbackMode / reason）随 `InboxClarification` 落库，并传给第 2 段方案 Agent；`workMode` 仍是兼容字段和落库快捷值。方案 Agent 只承接这个结论，不许自己再判 mode（`readComposedPlan` 也以 `input.workMode` 为准）。

### frame

- 澄清不是问卷。每轮先形成 `InboxClarificationFrame`（`surfaceRequest` / `coreNeedHypothesis` / `decisionFork` / `decisiveUnknown` / `whyItChangesPlan` / `workingAssumptions` / `methodOptions`），随 `aiSuggestionJson` 持久化；下一轮必须基于上一轮 frame 继续，不能重新猜一遍。
- frame 还要带 `readiness`（ready / needs_context / needs_meaning）、`missingSlots`、`completionPrompt`、`completionOptions`。输入没有具体对象、或明显在说「我不知道干什么」时先走「补齐信息」路径，不要自行补出产品、写作、求职、健身等领域。
- `src/lib/idea-readiness.ts` 做本地完整性预判，模型可以纠正；但第一问不能与缺失槽位脱节。用户选「我也说不清」后，要继续帮他外部化真实事情，不要偷换成一个新的项目计划。

### 问题质量

- **只提问，不表理解**：问题里不许出现「我先按…理解」「我理解你…」「你其实想要…」，也不要说你判断了什么、缺什么。直接把那个取舍问出来。
- 只问会改变最终计划的未知点，只问当前 frontier（不要问需要等这个回答才能问的东西）。
- 默认一次只问一个问题，选项通常 2-3 个。只有用户自己明确列出多个并列对象时，才允许最多 6 个，且不能增加用户没提过的对象。
- 按需升级，不要一上来排满问卷：普通想法通常只问 1 个；出现两个截然不同的推进方向、或现实限制会改变取舍，才问第 2 个；只有第 2 个的答案暴露出新冲突（想要的跟现实条件相撞），才允许第 3 个。能靠默认假设往下走的地方不要变成问题。评估澄清质量要看「问了几轮」，只看单条问题好不好会漏掉这条。
- 配置 / 设备 / 软件选择类任务（换设备、选软件、买工具、配系统、选壁纸）必须先问 1-2 个只有用户知道、且会改变推荐的关键事实（系统 / 配置、预算、最看重的取舍），问完就收口，不要列成配置问卷。
- 提问不许重复：`clarificationHistory` 里问过、答过的不再问（含换一种说法重复）。能落到具体对象（哪件事、哪个人、什么场景）就不要停在「缺做法还是缺资源」这类抽象分类。
- 问题里的指代必须准确：写清是谁对谁、是什么事。
- 停止条件：用户回答一次后仍说不清 / 想不起 / 不知道，不要立刻收口，先换一个更具体、更容易回答的事实问题；至少问满两轮后仍说不清，再按 `workingAssumption` 收口。用户只在最初输入里说「说不清」时，第一问仍要问，帮他先定位一次。
- 收口时 `summary` 必须给出 `workingAssumption` 和 `ifWrongThen`，不能留下一个「会影响计划但没问」的 `newQuestion`。

### 分叉：现实，不是做法

- 候选路径的差异如果只是「先做 A 还是先做 B / 用什么工具 / 按什么顺序 / 套哪个模板」，那是 AI 自己该定的，`fork` 写 null，**不许拿去问用户**。只有差异来自「只有用户知道的事实（他要解决什么、手上有什么、能投入多少、真正卡在哪）」时才能问。
- 判断「现实还是做法」最有效的一招：**看 options 是不是动词**。每条都是一件「要去做的事」（先弄清… / 先算清… / 先复盘… / 先记录…）→ 在问做法，禁止。options 必须是「用户的处境或需要」，名词性状态：收入会变少 / 有存款能撑几个月 / 有件事一直卡着 / 想拿它找工作。
- A/B 不是默认问法。默认由 AI 自己判断一条路，只问缺的事实 / 条件。A/B 只能用于两个真正不同的现实目标或条件。
- 三类「看起来像取舍、其实是做法」的问题禁止问：① 顺序（先弄清为什么想走，还是先算清能撑多久）；② 范围（先解决晚餐还是先解决早餐）；③ 工具（用 Notion 还是飞书）。判断口径：这个答案你自己推不出来、只有用户知道，才配问。
- 分叉由第 1 段翻译 Agent 自己排出两条可能的推进路径、取它们之间的取舍来问，不依赖第 2 段。第 2 段的规划只在澄清收口后才生成，它不给候选。

### 提示词与界面

- 澄清提示词用 `CLARIFICATION_QUALITY_RULES`；不要把计划 / 任务质量规则追加到澄清请求里。
- 澄清框不要直接展示流式 JSON 的局部结果；流式过程只允许显示稳定的阶段状态，最终问题和选项在完成时一次性替换。
- 首次澄清不能同时挂两个 `InboxClarification`：QuickCapture 提交后只显示 loading bubble，交互只保留 `AiTaskPlanner` 的服务端实例。门禁：`repo-invariants.test.mjs` 禁止 `quick-capture.tsx` 再包含 `<InboxClarification`。
- 澄清确认成功后要清掉 `QuickCapture` 的 `pendingContent` / `streamPreview`；网页和小程序确认接口都要 `revalidatePath("/")`、`/files`、`/workspace`。

### 重试必须幂等

- `/api/ai/inbox/clarify` 推进请求必须带 `questionKey`；`advanceSocraticInboxClarification` 遇到已处理过的问题、或已 `done` 的状态，必须返回当前 `clarification`，不能报「这一轮已经处理过了」。
- 前端 `ChatClarify` 的失败分支必须回滚本次乐观追加的用户消息 / answers / history，否则重复提交会堆历史、卡在同一个问题。
- 门禁：`pnpm verify:clarify-retry`、`pnpm verify:clarify-flow`。

## 三模式

### 定义（按「有没有终点」分，不按时长、也不按信息是否充足）

| 模式 | 定义 | 关键特征 | 典型 |
| --- | --- | --- | --- |
| 普通 normal | 「我今天有一件事比较烦，要处理一件事，当下的事情」 | 封闭 + 当下，今天做完就结束 | 交报销单、换灯、把话说清楚 |
| 长期 longterm | 「小组作业或者某个项目，可能要花三四天甚至一周」 | 封闭 + 跨天，**有明确交付和截止** | 小组作业、上线页面、筹办活动 |
| 探索 explore | 「我要学习某一项技能，学习没有止境，需要慢慢探索」 | **开放、没有终点，但有路径** | 学一门技能、长期健身、长期写作 |

### 靠结构区分，不靠数量限制

- 普通：不需要阶段、不要求截止，一条完成路径，完成即结束。
- 长期：**必须有阶段切分 + 必须有截止日期**（阶段按截止倒推）；每阶段有可交付结果，交付后归档。
- 探索：**必须有路径（台阶）+ 节奏**；不设截止；**项目层不结束，但任务层照常「完成」**——任务完成时按进度再吐出下一条。
- 不要给模式设任务条数上限来「卡」行为（普通 ≤2 / 长期 ≤3 / 探索 ≤2 这类硬卡点用户明确不接受）。tasks 数量由完成当前里程碑真正需要几个独立结果决定，不设固定 1 条或 2 条。
- 不要再说「告一段落」：那是把「没有终点」错误压到任务层的产物。模式是**项目**的属性，不是任务的属性；任务三种模式都一样：待办 → 进行 → 完成。
- 三种模式都计数：探索只要用户启动（有任务并开始做）就算。

### 判定

- **用户永远不选模式**，界面里不出现「普通 / 长期 / 探索」。判定优先级：澄清阶段推断 > 计划阶段模型判断 > 兜底普通（拿不准就普通）。
- 判断不能靠关键词硬卡点，也不能问用户「你是短期还是长期」。要靠模型推理真实需求。
- 触发探索的是「没有终点的能力增长」（学 / 练 / 持续 / 一直 / 慢慢），不是「要不要做」——后者归普通。
- explore 的门槛刻意抬高（这一档最难控、内容质量最不稳）。**三条全满足才判 explore**：① 要的是持续、没有终点的状态 / 能力 / 习惯 / 关系；② 有明确的持续意图（长期 / 持续 / 慢慢 / 一直 / 每天，或明说不要终点）；③ 连「这一段先做成什么」都说不清。只要出现可交付结果、任何截止，或一次性的「试试 / 调研一下 / 了解一下 / 看看 / 做一次准备」，就判 normal / longterm。
- 开放能力的第一件作品仍按 explore：学手工、学插画、学音乐这类没有终点的能力，即使第一轮只是「先完成第一件作品 / 第一次练习」，也不能把整个目标降级成 normal。explore 计划必须带下一轮怎么接、练习节奏或换材料 / 技法的入口。
- 落点：`MODE_JUDGMENT_SYSTEM_PROMPT`（主判，生产与评测共用）、`heuristicProjectMode`（兜底，`src/lib/work-mode.ts`）；回归语料 `scripts/mode-judgment-corpus.json` 的 `explore-bar` 组。
- 判断输出必须带 `mode` + `confidence` + `realNeed` + `frame`（endState / endStateType / timeHorizon / hasDeliverable / hasDeadline / continuationIntent）+ `decisiveEvidence` + `fallbackMode` + `reason`；低置信度默认落普通，并在计划里说明假设，**不要再问用户**。
- 解析模式判断结果时必须同时兼容「单对象」和「对象数组」：`extractJsonObject` 只取第一个平衡的 `{...}`，模型返回 `[...]` 会被剥成单个对象。回归测试 `src/lib/mode-judgment.test.ts`。

### 探索：多线路、有主次

- 探索不等于「没有终点的单线练习」。长期是一条线按阶段走、有明确终点；探索是**可能同时有多条线路在发展**、有主次、没有终点。
- 线路不强制多条：只有一个方向时就只有一条主线，不硬凑。结构上永远保留线路层，数量由真实情况决定（通常 1-3 条）。
- 任何时候主线只有一条。主次不是创建时定死的，由反馈调整：支线连续拿到有效反馈、或主线连续卡住 → 支线上位，原主线降为 side。
- 多线不等于一次给多个任务：每条线同时只保留一条开放任务，一个探索项目开放任务上限 3 条。任务事件（完成 / 取消 / 卡住）是唯一触发源，**禁止按 cadence、星期几或间隔天数排期**。
- 推进是**任务事件驱动**：触发源只能是任务完成、卡住、取消、编辑、补充结果等事件；`cadence` 只作节奏描述，不能成为触发器或硬排期。
- 每次任务事件后，Agent 读取当前任务与项目的真实值（status / notes / doneWhen / methodHint / completedAt / currentMilestone / 历史反馈 / 便利贴执行信息），判断这次探索是否产生变化，再决定是否续接下一条任务。
- 「复盘」在探索模式里不是独立页面或用户填写流程，而是系统内部的推进判断：看当前值 → 判断走到哪 → 推进任务继续 → 更新探索过程。**不要重新挂载 Review 页面，也不要让新链路依赖 `Review` / `ReviewNextAction`。**
- 实现落点：`project_tracks` 表 + `Task.trackId`（迁移 `20261014000000_add_project_tracks`）、`src/lib/project-track.ts`、方案 Agent 产 tracks 并给任务打 trackName（`src/lib/agent-plan/prompts.ts`、`normal.ts`）、续接 Agent（`src/lib/project-progress-agent.ts`）、文件页线路图（`src/components/file-browser.tsx`）。
- 门禁：`src/lib/project-track.test.ts`、`scripts/verify-explore-tracks.mjs`（需本地服务）。

### 长期：阶段推进

- 长期项目在当前阶段进行中就先预生成简短的「下一阶段预览」：阶段总结、目标、交付物、第一条任务、预计窗口。阶段真正收口时按最终结果重算；用户点「进入下一阶段」后只做事务落库，不再等待模型。
- 必须过「阶段完成门」：当前阶段的交付物 / 完成条件真正达成后，才生成下一阶段预览。仅任务清空、全部关闭、取消或延期不算阶段完成；交付物没达成只能继续补齐当前阶段。
- `confirmStagePreviewAction` 必须用条件 `updateMany` 原子抢占 ready 阶段；同一个阶段只能生成一个下一阶段，不能先读 status 再无条件创建。
- 长期项目最多 `MAX_LONGTERM_STAGES = 5` 个阶段；每阶段默认 2-4 条任务，超过 4 条必须合并。
- 只有明确的外部等待（等审批、等签字、等回复、等到账）才允许单条任务单独成阶段；其他单条真实任务必须并回当前阶段。
- 到第 5 阶段或没有新的真实里程碑时，项目暂停收口，不自动生成下一阶段；UI 显示「第 X/5 阶段」。
- 生成下一阶段任务前必须先和项目已有任务去重；过滤后为空就不能创建下一阶段，也不允许强行塞 fallback 任务。UI 在 `nextStage.tasks` 为空时显示「当前阶段已收口，不再自动接下一阶段」。
- 长期预览任务禁止生成「确认、汇总、核对、填表、存档、收齐、逐人回复、整理表格、修订表格」等内部整理动作——这些只能是完成信号，不是任务。
- 门禁：`scripts/verify-explore-tracks.mjs`。

## 任务合同与输出质量

- 每条任务都要有「怎么做」的合同，落在 `tasks` 表的 `executionMode` / `doneWhen` / `maxTurns` / `toolPolicy` 字段（`src/lib/task-contract.ts`）。`executionMode` 取 quick / tool / produce / explore / project；`maxTurns` 为 quick=1、tool/produce=2、explore/project=3；`toolPolicy` 取 none / read / confirm-write。
- 小任务不要工程化：quick 任务生成后一轮结束，不再追问、不再拆下一层（这不影响澄清阶段至少两轮提问）。只有长期目标才用 project，且一轮只推进当前阶段，不自动生成无穷尽的后续任务。
- 每条任务都必须带 `methodHint`，和 title / doneWhen 同级；它要说清最适合的做法，必要时在同一条里点出工具、材料、渠道或验证方式。不要新增独立的「工具推荐」板块，methodHint 内嵌在任务里并持久化到 `tasks.methodHint`。
- v3.5 起任务还必须带 `recommendation` / `executionSteps` / `fallback`：推荐是已经替用户做出的默认决定，执行步骤要包含去哪里、做什么、例外怎么处理，fallback 是主方案失效时的替代路径。
- 判断「已经替用户做出决定」的标准：推荐本身要包含答案——要买的具体东西、要用的具体工具、要做的具体判断。凡是「先去了解 / 先去拍照 / 再筛选 / 再决定 / 挑出几个组合」这类把决定推迟给用户的写法都不合格。不能把「自己去设计几个方案」当第一任务。
- 目标和里程碑必须具体到对象、范围、可检查的结果，禁止「初版」「最小一步」「先确认方向」「核心方向」「现实限制」这类空泛说法。
- 载体必须是「这件事真正发生的地方」，不是「先记一下 / 先写下来」。只有目标本身就是记录、复盘，或记录是验证结果的必要证据时，「写下来」才算产出。
- 必要的信息补充放在便利贴里，不再单独做回答页或新的出口。
- 复盘生成的下一步任务要精炼：每条两行（精简标题 + 具体说明），具体内容放进任务正文展开，不标序号、不写竖线。任务标题生成好再上屏，不能让用户看到「先有正文再总结标题」的过程。
- 确认 AI 计划时，新任务必须自动生成第一张便利贴：`recommendation` 作为便利贴主内容、`executionSteps` 作为步骤、`nextStep` 作为当前动作，`fallback` 只落库、不写进便利贴。
- 首启引导（`completeFirstRun` / `planOnboarding`）必须走同一条决策链：`generateFirstRunPlan` 返回 `taskRecommendation / taskExecutionSteps / taskFallback`，落库时用 `decisionCardFromTask` + `stickyPayloadFromDecisionCard` 生成第一张便利贴。prompt 放在 `ai-prompts.ts` 的 `FIRST_RUN_PLAN_SYSTEM_PROMPT`，和评测脚本共用同一份，不要再写回内联字符串。

## 提示词原则

- 代码只是给 API 套一层「提示词的壳」，不限制模型输出什么。不要用代码或提示词去规定模型「必须选哪个 responseMode」。
- `OUTPUT_QUALITY_RULES`（`src/lib/ai.ts`）禁止删除。它约束：不要在每轮开头先肯定用户，不要复用「我大概知道你真正看重什么了」「接下来不再套标准流程」「先做最小下一步」「不是 A 而是 B」这类模板句，也不要把用户最后选的选项原样复述一遍当作理解。
- **提示词里不准出现具体记录工具名**（「备忘录」这类）——负面例子也会被模型模仿，这正是它一直吐「备忘录」的直接原因。门禁：`src/lib/ai-quality.ts` 的 `RECORD_TOOL_PHRASES`。
- 「工具」对走走意味着**用 AI 的搜索 / 查证能力抹平信息差**，不是把输出绑定到某个 App。需要外部信息时，让模型直接给出「查什么 / 去哪查 / 按什么标准判断」的可用结论，不要把「先了解 / 先调研」丢回给用户。
- 系统按需调用 DeepSeek 官方 Search / Fetch API：`POST /v1/tools/search` 与 `POST /v1/tools/fetch`，使用同一个 DeepSeek API Key。`src/lib/web-search.ts` 负责判断、调用、超时和失败降级；`src/lib/tool-router.ts` 继续做 kind 标签。`webEvidence.status=ok` 时必须使用结果并带来源；没有结果或失败时，不能假装系统已经查到。
- 软件 / 工具选择默认先给免费或系统自带方案。用户没有明确要付费资源或更强功能时，不要默认推荐付费工具。
- 上下文回灌：不要把旧便利贴的 `nextStep` 原样放进 `decisionMemory`，只保留语义化标题 / 决策摘要，避免模型模仿旧载体。便利贴 AI 失败兜底必须先用任务的 `methodHint` / `doneWhen`，不要再生成「写下 / 列出」。计划 Agent 的「理想动作示例」不要包含「写下」；记录、清点、列清单不是默认任务动作。
- 便利贴手动补充的 TASK_STICKY_SYSTEM_PROMPT 只保留两类内容：便利贴基本写作规则，以及本次补充如何合并任务、memorySummary、contextEvidence 和 previousStickyNotes。不要在这段提示词里重复模式判断、项目规划、工具选择、日期或任务拆分规则。
- 生产与评测必须共用同一份 prompt 组装逻辑，禁止在脚本里另写近似版（`MODE_JUDGMENT_SYSTEM_PROMPT`、`buildPlanAgentSystemPrompt`、`FIRST_RUN_PLAN_SYSTEM_PROMPT` 等）。计划 Agent 的共享合同和三种模式 playbook 分开维护；模式 playbook 必须包含规划算法、硬约束、反例和自检问题，不能只写几句定义。计划评测的提示词指纹使用 `PLAN_AGENT_PROMPT_BUNDLE`，必须覆盖三种模式。

## DeepSeek 推理档位与时间预算

- 质量关键链路（计划、澄清、新人引导、便利贴）统一用 `deepseek-flash + reasoning_effort: "none"`。不要改成 `low` / `high`：V4 的 reasoning tokens 计入 `max_tokens`，`low` / `high` 会偶发把 2800 token 全用在推理上、正文为空，`planInbox` 静默回落到本地规则，表现就是「AI 没用到 / API 掉了」。
- `callModel` 必须把 `"none"` 原样透传给 DeepSeek，不能归一化成 `undefined`，否则 API 用默认高推理，同样会吃满预算。
- 计划 `maxTokens` 保持 2800。实测 6000 会让模型想得更久、跑到约 24 秒，超过单次上限；`none + 2800` 实测约 5-7 秒且有正文。
- `callModel` 必须有总时间预算：当前总上限 26 秒、单次 20 秒。任何 AI 请求都不能让按钮无限停在「处理中」。
- 换模型或调推理档位时，必须同时验证三件事：`finish_reason=stop`、正文非空且 JSON 可解析、完整耗时低于 20 秒。

## 门禁

- `pnpm eval:clarify`：澄清场景，覆盖单轮与多轮（corpus 用 `followUps` 声明第 2 轮模拟回答，断言第二问必须接住上一轮的话 `mustBuildOn`、到上限必须收口）。
- `pnpm eval:ai`：计划结构 + methodHint。
- `pnpm eval:mode`：模式判定（`--gate` 默认 0.9，低于阈值退出码 1；加 `--with-clarify` 测澄清后判断）。
- `pnpm eval:first-run`：首启计划。
- `pnpm verify:clarify-flow`：真实 HTTP 澄清到计划端到端（需本地服务）；要同时断言确认后首页不再有澄清卡片，并拉一次 `/files?project=<id>` 确认便利贴的 `nextStep` 和执行步骤真的渲染给用户（不能只存在数据库里）。
- `pnpm verify:clarify-retry`：同一回答连续提交两次必须幂等。