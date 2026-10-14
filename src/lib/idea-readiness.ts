/**
 * 输入完整性判断。
 *
 * 只做一件事：在模型开始“猜”之前，先判断这句话里有没有一个真实可推进的对象。
 * 这里不追求把用户分类得很细，而是决定第一问应该是“补全信息”还是“做关键取舍”。
 */
export type IdeaReadiness = "ready" | "needs_context" | "needs_meaning";

export type IdeaAssessment = {
  readiness: IdeaReadiness;
  missingSlots: string[];
  reason: string;
  completionPrompt: string;
  completionOptions: string[];
};

const META_SIGNALS =
  /不知道(?:要)?(?:做|干)(?:什么|啥)|不知道干什么|不知道从哪|从哪里开始|没(?:有)?头绪|没想法|想不出来|说不清|随便|都行|迷茫|不知所措/;

const ABSTRACT_OBJECT =
  /(?:一个|个)?(?:任务|计划|项目|事情|东西|方向|目标|想法|下一步|安排)/;

const CONCRETE_OBJECT =
  /个人网站|作品集|博客|公众号|账号|播客|视频|文章|简历|面试|课程|论文|项目|产品|功能|客户|用户|室友|伴侣|父母|家人|朋友|同事|健身|运动|睡眠|体检|旅行|搬家|租房|账单|预算|手机|电脑|房间|会议|文档|表格|照片|音乐|插画|画画|社群|活动|比赛|实习|工作|学习|英语|AI|代码|仓库|网站|页面|脚本|读书|笔记|收藏夹|教程/;

const CONFIG_DEPENDENT =
  /(?:换|买|装|选|挑|推荐|升级|下载|设置).{0,12}(?:电脑|笔记本|台式机|手机|平板|设备|系统|软件|工具|壁纸|显卡|内存|配置)|(?:电脑|笔记本|台式机|手机|平板|设备|系统|软件|工具|壁纸|显卡|内存|配置).{0,12}(?:换|买|装|选|挑|推荐|升级|下载|设置)/;

const CONCRETE_ACTION =
  /写|做|改|查|整理|联系|沟通|发布|上线|准备|完成|测试|验证|比较|选择|决定|报名|申请|预约|购买|退订|记录|复盘|拆分|访谈|调研/;

function normalize(input: string) {
  return input.replace(/\s+/g, "").trim();
}

function looksLikeAbstractOnly(text: string) {
  return ABSTRACT_OBJECT.test(text) && text.length <= 36;
}

export function assessIdeaReadiness(input: string): IdeaAssessment {
  const text = normalize(input);
  const hasConcreteObject = CONCRETE_OBJECT.test(text);
  const hasConcreteAction = CONCRETE_ACTION.test(text);
  const hasMetaSignal = META_SIGNALS.test(text);
  const abstractOnly = looksLikeAbstractOnly(text) && !hasConcreteObject;

  if (hasMetaSignal && !hasConcreteObject) {
    return {
      readiness: "needs_meaning",
      missingSlots: ["具体对象", "真正想改变的结果"],
      reason: "输入里只有抽象名词和状态，没有可推进的具体对象。",
      completionPrompt: "这句话里还没有一个能推进的对象。你现在更接近哪种情况？",
      completionOptions: [
        "我说不清具体是什么，想先理一理",
        "我知道是什么，但一直没动",
        "我其实想找一个新方向",
        "先帮我从最近反复想的事里找",
      ],
    };
  }

  if (text.length < 8 || !hasConcreteObject || (abstractOnly && !hasConcreteAction)) {
    return {
      readiness: "needs_context",
      missingSlots: ["具体对象", "想改变的结果"],
      reason: "这句话还没有落到一个可识别的对象或结果上。",
      completionPrompt: "先补一句：这件事具体指什么？",
      completionOptions: [
        "一件工作或学习上的事",
        "一段关系或一次沟通",
        "身体、生活安排或日常习惯",
        "我现在也说不清",
      ],
    };
  }

  if (CONFIG_DEPENDENT.test(text)) {
    return {
      readiness: "needs_context",
      missingSlots: ["设备/系统配置", "最看重的取舍"],
      reason: "这类选择会随设备配置和真实偏好改变，不能直接替你猜。",
      completionPrompt: "先确认你的电脑是什么系统、大概什么配置，以及你更想省资源还是效果优先。",
      completionOptions: [
        "Windows 笔记本，先保证不卡",
        "Windows 台式机，可以接受少量占用",
        "Mac，想找系统原生方案",
        "我不确定，先教我怎么看",
      ],
    };
  }

  return {
    readiness: "ready",
    missingSlots: [],
    reason: "输入里已经出现了具体对象，可以进入关键取舍判断。",
    completionPrompt: "",
    completionOptions: [],
  };
}
