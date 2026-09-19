Page({
  data: {
    outcomes: [
      {
        icon: "✦",
        title: "不用内耗复杂的思绪",
        body: "倒出想法，AI 自动归类到项目，生成可执行任务。"
      },
      {
        icon: "◉",
        title: "不用纠结今天做什么",
        body: "每天打开，先看到今天最该推进的 1-3 件事。"
      },
      {
        icon: "✎",
        title: "不用害怕半途而废",
        body: "每晚轻量复盘，AI 自动生成明天计划，形成持续闭环。"
      }
    ],
    steps: ["先聊清楚", "拆出计划", "推进与复盘"],
    activeStep: 0,
    demo: {
      idea: "最近收藏了十几个 AI 工具和教程，想搭一套自己的效率流程。每个看起来都有用，但一周过去还是照着旧方式做事，收藏夹越来越乱。",
      clarifyIntro: "你卡住的不是工具不够，而是没有把工具放进一个真实任务里验证。先确定想改善哪段流程，再决定哪些值得留下。",
      clarifyQuestion: "如果只改善一个环节，你最想先解决什么？",
      clarifyOptions: ["从零开始一项任务", "处理大量资料和会议", "把想法快速整理成产出"],
      clarifySelected: "处理大量资料和会议",
      followUp: "你更想先得到哪种判断？",
      followUpOptions: ["哪个工具真的省时间", "哪种流程自己坚持得了", "哪些工具可以暂时不用"],
      plan: {
        projectName: "AI 资料流瘦身",
        objective: "把现有工具放进一个真实任务里比较，留下最少、最顺的一套流程。",
        milestone: "完成一次真实资料整理，并写出保留与淘汰清单",
        tasks: [
          {
            title: "选一份这周必须处理的资料",
            time: "10 分钟",
            note: "用真实任务，不用收藏夹里的示例"
          },
          {
            title: "用现在的方法和另一个工具各处理一次",
            time: "30 分钟",
            note: "只记录耗时、卡点和最后能不能用"
          },
          {
            title: "留下 2 个工具，写下淘汰理由",
            time: "10 分钟",
            note: "标准不是功能多，而是下次你还会不会打开"
          }
        ]
      },
      review: {
        progress: "今天真正推进的是把工具焦虑收回到一个真实资料任务，卡在比较时容易又被新功能带走。",
        insight: "判断已经明确：保留的工具必须能减少一次复制粘贴或一次重复整理。",
        nextAction: "按留下的流程再处理一份资料，连续验证两次。"
      }
    },
    comparisons: [
      { name: "ChatGPT", gap: "会帮你整理，但不会持续记住你的目标和复盘。" },
      { name: "Todoist", gap: "帮你管理任务，但不知道你为什么做。" },
      { name: "Notion", gap: "给你一堆模板，但不知道哪个适合你。" },
      { name: "WorkBuddy", gap: "替你执行任务，但不会帮你决定该做什么。" },
      { name: "走走", gap: "帮你把想法变成可持续推进的个人项目。" }
    ],
    audiences: [
      "学习者：备考、学英语、学技能，一直开始不了。",
      "创作者：自媒体、写作、作品集，想法多但输出少。",
      "自由职业者：项目杂、优先级乱，需要每天聚焦。",
      "知识工作者：会议和琐事多，需要把重要目标拉回日常。"
    ]
  },

  onStepTap(event) {
    const index = Number(event.currentTarget.dataset.index) || 0;
    this.setData({ activeStep: index });
  },

  onLoginTap() {
    wx.navigateTo({
      url: "/pages/login/login"
    });
  }
});