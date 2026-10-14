import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlan } from "@/lib/agent-plan/core";
import { CONTENT_GENERATION_SYSTEM_PROMPT } from "@/lib/agent-plan/prompts";

test("规划执行 Agent 只排一条路，不做搜索和任务拆解", () => {
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("规划执行 Agent"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("只给一条路"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("不要写任务字段"));
  assert.ok(CONTENT_GENERATION_SYSTEM_PROMPT.includes("不要候选"));
});

test("规划会解析成收敛 Agent 可用的结构", () => {
  const plan = readPlan({
    plan: {
      goal: "上线一个能对外展示的单页作品集",
      constraints: ["只有周末有空"],
      route: "先整理作品再上线，不做博客结构",
      steps: [
        {
          action: "挑出 3 个代表作品",
          how: "从已有项目里按能力覆盖挑",
          output: "3 个作品条目",
        },
        {
          action: "用模板上线",
          how: "Carrd 免费模板，填完直接发布",
          output: "一个公开链接",
        },
      ],
    },
  });
  assert.ok(plan);
  assert.equal(plan.steps.length, 2);
  assert.match(plan.route, /先整理作品/);
  assert.equal(plan.steps[1].output, "一个公开链接");
  assert.deepEqual(plan.constraints, ["只有周末有空"]);
});

test("规划缺步骤或缺路线时判为不可用", () => {
  assert.equal(readPlan({ plan: { goal: "x", route: "y", steps: [] } }), null);
  assert.equal(readPlan({ plan: { goal: "x", steps: [{ action: "a" }] } }), null);
  assert.equal(readPlan({}), null);
});
