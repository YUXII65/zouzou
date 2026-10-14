import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decisionCardFromAdvice,
  decisionCardFromTask,
  decisionSessionFromReview,
  buildDecisionSession,
  routeDecisionKind,
  stickyPayloadFromDecisionCard,
} from "@/lib/decision";

test("计划任务会收敛成一张有默认推荐的决策卡", () => {
  const card = decisionCardFromTask({
    title: "按午餐默认组合买一餐并记录",
    shortTitle: "验证午餐组合",
    recommendation: "买即食鸡胸 + 沙拉 + 饭团",
    executionSteps: ["去便利店买组合", "吃完记录饱腹感"],
    fallback: "没有鸡胸就换卤蛋和豆干",
    methodHint: "按蛋白质、蔬菜、主食三类拿",
    doneWhen: "实际吃到并完成记录",
  });

  assert.equal(card.kind, "plan");
  assert.equal(card.recommendation, "买即食鸡胸 + 沙拉 + 饭团");
  assert.equal(card.nextStep, "去便利店买组合");
  assert.ok(card.confidence > 0.5);
});

test("便利贴保存内容会把 fallback 放回执行步骤", () => {
  const payload = stickyPayloadFromDecisionCard(
    decisionCardFromTask({
      title: "按午餐默认组合买一餐并记录",
      shortTitle: "验证午餐组合",
      recommendation: "买即食鸡胸 + 沙拉 + 饭团",
      executionSteps: ["去便利店买组合", "吃完记录饱腹感"],
      fallback: "没有鸡胸就换卤蛋和豆干",
      methodHint: "按蛋白质、蔬菜、主食三类拿",
      doneWhen: "实际吃到并完成记录",
    }),
  );

  assert.equal(payload.nextStep, "去便利店买组合");
  assert.deepEqual(payload.steps, [
    "去便利店买组合",
    "吃完记录饱腹感\n例外：没有鸡胸就换卤蛋和豆干",
  ]);
});

test("旧便利贴建议也会转换成同一种决策卡", () => {
  const card = decisionCardFromAdvice({
    title: "先打开项目",
    encouragement: "先看断在哪一步",
    steps: ["打开项目", "运行一次"],
    nextStep: "打开项目",
  });
  assert.equal(card.kind, "coach");
  assert.equal(card.nextStep, "打开项目");
  assert.equal(card.doneWhen, "运行一次");
});

test("决策路由会区分推荐、比较、计划和补齐信息", () => {
  assert.equal(routeDecisionKind({ message: "轻食推荐吃什么" }), "recommend");
  assert.equal(routeDecisionKind({ message: "外卖还是便利店哪个好" }), "compare");
  assert.equal(routeDecisionKind({ message: "帮我安排一周计划" }), "plan");
  assert.equal(
    routeDecisionKind({ message: "我不知道干什么", readiness: "needs_meaning" }),
    "clarify",
  );
});

test("计划完成后会形成可执行的决策会话", () => {
  const session = buildDecisionSession({
    stage: "execute",
    kind: "plan",
    coreNeedHypothesis: "先把外卖替换成能直接买的轻食组合",
    recommendation: "午餐先买即食鸡胸 + 沙拉 + 饭团",
    nextAction: "今天中午先去便利店买这一套",
    fallback: "没有鸡胸就换卤蛋和豆干",
    confidence: 0.9,
  });
  assert.equal(session.stage, "execute");
  assert.equal(session.nextAction, "今天中午先去便利店买这一套");
  assert.equal(session.confidence, 0.9);
});

test("复盘结论会形成可回流的决策会话", () => {
  const session = decisionSessionFromReview({
    summary: "今天验证了午餐组合，下午没有明显饿",
    nextAction: "明天按同一组合再吃一次",
  });
  assert.equal(session.kind, "review");
  assert.equal(session.stage, "execute");
  assert.equal(session.nextAction, "明天按同一组合再吃一次");
});
test("执行卡片会去掉模型自己写的步骤序号，避免界面双重编号", () => {
  const payload = stickyPayloadFromDecisionCard(
    decisionCardFromTask({
      title: "整理作品集",
      shortTitle: "整理作品集",
      recommendation: "先定用途",
      executionSteps: ["1. 先定用途", "2、再筛素材", "第三步：排序"],
      fallback: "",
      methodHint: "按用途筛",
      doneWhen: "有一版能发出去",
    }),
  );
  assert.deepEqual(payload.steps, ["先定用途", "再筛素材", "排序"]);
});

test("便利贴最多保留三个真实阶段，多余动作合并进最后一块", () => {
  const payload = stickyPayloadFromDecisionCard(
    decisionCardFromTask({
      title: "测试连续动作",
      shortTitle: "测试步骤合并",
      recommendation: "直接开始",
      executionSteps: ["第一步：开始", "第二步：继续", "第三步：落笔", "第四步：检查", "第五步：提交"],
      fallback: "",
      methodHint: "直接做",
      doneWhen: "做完",
    }),
  );
  assert.equal(payload.steps.length, 3);
  assert.equal(payload.steps[2], "落笔；检查；提交");
});
