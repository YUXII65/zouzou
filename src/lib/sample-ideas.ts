export const sampleIdeas = [
  "收藏了十几个 AI 工具，想先搭一套真正会用的工作流",
  "和室友总因为公共区域闹别扭，想准备一次不尴尬的沟通",
  "拍了很多城市夜景，想从中选出一个连续的系列",
  "每天都很忙，但说不清时间到底花在了哪里",
  "想组织一次 10 人周末徒步，群聊两周还没定下来",
  "房间换季很乱，想先处理一个最影响生活的小区域",
  "想给爸妈安排一次体检，但信息太散不知道从哪开始",
  "想学做三道拿手菜，招待朋友时不用临时找菜谱",
  "电脑文件越来越乱，想建立一套真正找得到东西的规则",
  "旅行回来照片一直躺在手机里，想做成一本相册",
  "最近总在临时救火，想找出反复出现的时间漏洞",
  "想做一期播客，但选题和结构一直没定",
  "想把读过的书变成真正能用的笔记",
  "想给家里做一次预算，先把每月固定支出看清楚",
  "想重启一个搁置很久的小项目，但不想从头再来",
  "想练一组十分钟能出门的运动，先找回一点身体状态",
  "想整理自己的简历，把做过的项目讲清楚",
  "想减少睡前刷手机，先改一个最容易控制的环节",
  "想把一个想法做成 90 秒的短视频，先确定第一版结构",
  "最近和朋友联系少了，想安排一次不费力的见面",
  "想系统了解一个陌生领域，但资料太多不知道先看什么",
  "想把一个爱好变成周末固定活动，而不是偶尔想起",
  "想整理一份个人操作手册，减少每次重新想",
  "想处理一直拖着的小事，但不知道先从哪件开始",
  "想写一篇文章，把最近几个月的经历整理成一条线",
  "想给一个重要的人准备一份真正合适的礼物",
  "想为自己的房间做一次灯光和收纳的小改造",
  "想研究一个重要的选择，但不想只靠想象做判断",
  "想清理手机里几千张截图，先建立一套新的取舍标准",
  "想准备一次公开分享，把内容讲得清楚又不无聊",
  "想给自己安排一个完整但不赶时间的周末",
];

export function sampleIdeasForDate(count = 3) {
  const start = (new Date().getDate() * 7) % sampleIdeas.length;
  return Array.from({ length: count }, (_, index) =>
    sampleIdeas[(start + index) % sampleIdeas.length],
  );
}

export function pickRandomSampleIdeas(count = 3) {
  const copy = [...sampleIdeas];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy.slice(0, count);
}
