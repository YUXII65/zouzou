import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditNormalAgentPlan,
  createAgentFailedPlan,
  normalizeProjectName,
  type NormalAgentBrief,
} from "@/lib/agent-plan/core";
import type { InboxPlan } from "@/lib/ai";

const brief: NormalAgentBrief = {
  goal: "把已有草稿做成一条可发布的短视频",
  confirmedFacts: ["用户没有大块时间"],
  constraints: ["今晚只有 20 分钟"],
  successSignal: "拿到一段能直接录制的 40 秒口播稿",
  assumptions: [],
  ifWrongThen: "如果草稿没有可用主题，就换最近一次和别人聊过的真实问题",
};


function validPlan(overrides: Partial<InboxPlan> = {}): InboxPlan {
  return {
    action: "single_task",
    taskDisposition: "new_tasks",
    projectName: "一条短视频",
    projectObjective: "从不重新选题开始，完成并发布一条短视频",
    projectMilestone: "拿到一段能直接录制的口播稿",
    mode: "normal",
    reason: "因为今晚只有 20 分钟，先从已有草稿里完成一条，不再重新选题。",
    source: "model",
    userCard: {
      understanding: "你缺的不是想法，而是没有把已有草稿直接推到成片。",
      firstAction: "从最近 10 条草稿里选一条能一句话说清主题的，补成三句话。",
      how: "按冲突、转折、结论各写一句，写完念一遍。",
      doneWhen: "备忘录里出现一段 40 秒内能念完的口播稿。",
    },
    agent: {
      usedFacts: ["用户没有大块时间"],
      assumptionsUsed: [],
      auditIssues: [],
    },
    tasks: [
      {
        title: "从最近 10 条草稿里选一条，补成一段 40 秒口播稿",
        shortTitle: "草稿补成口播稿",
        executionMode: "produce",
        doneWhen: "备忘录里出现一段 40 秒内能念完的口播稿",
        methodHint: "按冲突、转折、结论各写一句，写完念一遍并改到顺口",
        recommendation: "选最近一条你能用一句话说清主题的草稿，不再重新选题",
        executionSteps: [
          "扫最近 10 条草稿，确定唯一一条能用一句话说清主题的想法",
          "按冲突、转折、结论各写一句",
        ],
        fallback: "如果草稿里没有可用主题，就换最近一次和别人聊过的问题",
        maxTurns: 2,
        toolPolicy: "none",
        notes: null,
        priority: "high",
        scheduledDate: null,
        dueDate: null,
      },
    ],
    ...overrides,
  };
}

test("普通模式方案通过一致性检查", () => {
  assert.deepEqual(auditNormalAgentPlan(validPlan(), brief), []);
});

test("用户结果里出现二选一会被拦住", () => {
  const plan = validPlan({
    userCard: {
      understanding: "你有两种做法。",
      firstAction: "先比较直接从草稿开始，还是先批量写选题。",
      how: "看情况选择其中一种。",
      doneWhen: "选出一个方向。",
    },
  });
  const issues = auditNormalAgentPlan(plan, brief);
  assert.ok(issues.some((issue) => issue.includes("二选一")));
  assert.ok(issues.some((issue) => issue.includes("先做判断")));
});

test("显而易见的软件点击教程会被拦住", () => {
  const plan = validPlan({
    userCard: {
      understanding: "你需要先确认日期范围。",
      firstAction: "确定要查询的日期范围。",
      how: "打开日历，点击日期控件，搜索具体日期后确认。",
      doneWhen: "日期范围已确定。",
    },
  });
  const issues = auditNormalAgentPlan(plan, brief);
  assert.ok(issues.some((issue) => issue.includes("软件点击教程")));
});

test("没有使用已确认事实会被拦住", () => {
  const plan = validPlan();
  plan.agent = { ...plan.agent!, usedFacts: [] };
  const issues = auditNormalAgentPlan(plan, brief);
  assert.ok(issues.some((issue) => issue.includes("已确认事实")));
});

test("失败计划不携带任务并显式标记", () => {
  const plan = createAgentFailedPlan({
    reason: "方案没有通过一致性检查",
    issues: ["策略候选不足"],
  });
  assert.equal(plan.source, "agent_failed");
  assert.equal(plan.tasks.length, 0);
  assert.deepEqual(plan.agent?.auditIssues, ["策略候选不足"]);
});
test("项目名不会把元描述当成标题", () => {
  assert.equal(
    normalizeProjectName("用户想从写作这一类开始", "想从写作这一类开始"),
    "写作",
  );
  assert.equal(
    normalizeProjectName("公开写作分享", "想从写作这一类开始"),
    "公开写作分享",
  );
});