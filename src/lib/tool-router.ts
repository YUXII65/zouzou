/**
 * 工具路由：判断一条任务在推进时该不该借助外部工具。
 *
 * V2.5 的取舍是「能直接回答的直接回答，需要事实和资料的才出去找」，
 * 同时把「需要用户确认的写操作」和「只读查询」严格分开，
 * 避免模型自己去登录、注册、下单。
 */
export type ToolKind = "none" | "search" | "read" | "github" | "docs";

export type ToolDecision = {
  /** 实际要调用的能力 */
  kind: ToolKind;
  /** none = 不联网；read = 只读；confirm-write = 必须用户确认后才能写 */
  policy: "none" | "read" | "confirm-write";
  /** 给用户看的一句话，说明为什么需要或不需要工具 */
  reason: string;
};

const WRITE_SIGNAL =
  /发布|上线|提交表单|注册(?:一个|个|新)?(?:账号|帐号|账户)|投稿|下单|购买|付款|支付|发送消息|私信|评论|回复|填写表单|申请|报名|预约|注销|退订/;
const READ_URL_SIGNAL = /https?:\/\/|网址|链接|这个网页|这篇文章|那个页面/;
const GITHUB_SIGNAL = /github|仓库|开源项目|代码库|pull request|\bpr\b/;
const DOCS_SIGNAL = /\bapi\b|接口文档|官方文档|文档|sdk|开发文档/i;
const FRESH_SIGNAL =
  /最新|最近|现在|今年|今天|价格|行情|政策|新闻|版本|更新|发布了吗|有没有|找一下|搜一下|查一下|查一查|调研|对比/;

export function routeTool(input: string): ToolDecision {
  const text = input.trim();

  if (!text) {
    return { kind: "none", policy: "none", reason: "没有需要外部信息的部分" };
  }

  if (WRITE_SIGNAL.test(text)) {
    return {
      kind: "none",
      policy: "confirm-write",
      reason: "这一步会真的对外写内容，需要你确认后我再执行",
    };
  }

  if (GITHUB_SIGNAL.test(text)) {
    return {
      kind: "github",
      policy: "read",
      reason: "需要在代码仓库里查现状",
    };
  }

  if (DOCS_SIGNAL.test(text)) {
    return {
      kind: "docs",
      policy: "read",
      reason: "需要对照官方文档确认行为",
    };
  }

  if (READ_URL_SIGNAL.test(text)) {
    return {
      kind: "read",
      policy: "read",
      reason: "需要先读一下你给的页面内容",
    };
  }

  if (FRESH_SIGNAL.test(text)) {
    return {
      kind: "search",
      policy: "read",
      reason: "这个问题依赖外部最新信息，直接猜不可靠",
    };
  }

  return {
    kind: "none",
    policy: "none",
    reason: "不依赖外部信息，可以直接做",
  };
}

export function toolKindLabel(kind: ToolKind) {
  switch (kind) {
    case "search":
      return "联网搜索";
    case "read":
      return "读取页面";
    case "github":
      return "查看仓库";
    case "docs":
      return "查文档";
    default:
      return "不需要联网";
  }
}
