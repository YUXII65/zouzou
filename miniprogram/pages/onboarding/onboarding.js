Page({
  data: {
    stepIndex: 0,
    steps: [
      {
        step: "1",
        title: "先从一句话开始",
        body: "把脑子里那件事直接倒出来，不用整理。点「下一步」后，走走会先问你几句，再把它变成能开始的行动。",
        button: "知道了"
      },
      {
        step: "2",
        title: "把任务推起来",
        body: "点击【下一步】推进任务，一次只用走一小步。任务完成后，再回到这里继续下一件。",
        button: "知道了"
      },
      {
        step: "3",
        title: "使用便利贴",
        body: "点一下【便利贴】，AI 会为你写一张详细执行步骤。你也可以补充自己的想法或卡点。",
        button: "去记录并开始"
      }
    ]
  },

  onLoad() { this.loadState(); },

  loadState() {
    const { getToken, getOnboarding } = require("../../utils/api");
    if (!getToken()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    getOnboarding()
      .then((state) => {
        if (!state.isFirstRun || state.tourStep === "done") {
          wx.reLaunch({ url: "/pages/today/today" });
          return;
        }
        const index = Math.max(this.data.steps.findIndex((item) => item.step === state.tourStep), 0);
        this.setData({ stepIndex: index });
      })
      .catch(() => {});
  },

  onNext() {
    const current = this.data.steps[this.data.stepIndex];
    if (!current) return;
    if (this.data.stepIndex >= this.data.steps.length - 1) {
      this.finish();
      return;
    }
    const nextIndex = this.data.stepIndex + 1;
    const nextStep = this.data.steps[nextIndex].step;
    const { setOnboardingStep } = require("../../utils/api");
    this.setData({ stepIndex: nextIndex });
    setOnboardingStep(nextStep).catch(() => {});
  },

  onSkip() { this.finish(); },

  finish() {
    const { setOnboardingStep } = require("../../utils/api");
    setOnboardingStep("done")
      .catch(() => {})
      .then(() => wx.reLaunch({ url: "/pages/today/today" }));
  }
});