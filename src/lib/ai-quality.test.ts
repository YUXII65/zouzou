import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkClarificationQuality,
  checkPlanQuality,
  compareAgainstBaseline,
} from "@/lib/ai-quality";

type Task = Record<string, unknown>;

function task(overrides: Task = {}): Task {
  return {
    title: "整理上周的用户访谈记录并标出三个反复出现的抱怨",
    shortTitle: "整理访谈抱怨",
    executionMode: "produce",
    doneWhen: "产出一份标好三处抱怨的访谈摘要",
    methodHint: "先按访谈提纲标出具体抱怨，再按出现频次归并重复项",
    recommendation: "先把三份访谈里的具体抱怨摘出来，按重复次数排序",
    executionSteps: ["打开三份访谈记录", "标出具体抱怨", "按重复次数排序并写摘要"],
    fallback: "如果访谈内容不完整，先补充一次回访再整理",
    maxTurns: 2,
    toolPolicy: "none",
    notes: null,
    ...overrides,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    action: "single_task",
    projectName: null,
    projectObjective: "把访谈里的抱怨整理成可以改进的方向",
    projectMilestone: null,
    tasks: [task()],
    reason: "你已经收集了三份访谈，先整理出来才看得出重复的问题",
    ...overrides,
  };
}

test("合格的计划不报问题", () => {
  assert.deepEqual(checkPlanQuality(plan(), { maxTasks: 3 }), []);
});

test("不是对象直接判定无效", () => {
  assert.deepEqual(checkPlanQuality(null), ["计划不是有效的 JSON 对象"]);
  assert.deepEqual(checkPlanQuality("文本"), ["计划不是有效的 JSON 对象"]);
});

test("没有任务时只报这一条并提前结束", () => {
  const issues = checkPlanQuality(plan({ tasks: [] }));
  assert.equal(issues.length, 1);
  assert.match(issues[0], /至少要有一条任务/);
});

test("缺少 reason 会被抓出来", () => {
  const issues = checkPlanQuality(plan({ reason: "" }));
  assert.ok(issues.some((issue) => issue.includes("缺少 reason")));
});

test("任务数超过上限会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task(), task({ title: "第二条任务" }), task({ title: "第三条任务" })] }),
    { maxTasks: 2 },
  );
  assert.ok(issues.some((issue) => issue.includes("超过上限")));
});

test("taskDisposition 非法会被抓出来", () => {
  const issues = checkPlanQuality(plan({ taskDisposition: "parallel" }));
  assert.ok(issues.some((issue) => issue.includes("taskDisposition 非法")));
});
test("mode 非法会被抓出来", () => {
  const issues = checkPlanQuality(plan({ mode: "someday" }));
  assert.ok(issues.some((issue) => issue.includes("mode 非法")));
});

test("maxTurns 与 executionMode 不一致会被抓出来", () => {
  const issues = checkPlanQuality(plan({ tasks: [task({ executionMode: "quick", maxTurns: 3 })] }));
  assert.ok(issues.some((issue) => issue.includes("不一致")));
});

test("executionMode 与 toolPolicy 取值非法会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task({ executionMode: "随便", toolPolicy: "随便写" })] }),
  );
  assert.ok(issues.some((issue) => issue.includes("executionMode 非法")));
  assert.ok(issues.some((issue) => issue.includes("toolPolicy 非法")));
});

test("缺少 doneWhen 会被抓出来", () => {
  const issues = checkPlanQuality(plan({ tasks: [task({ doneWhen: "" })] }));
  assert.ok(issues.some((issue) => issue.includes("缺少 doneWhen")));
});

test("缺少 methodHint 会被抓出来", () => {
  const issues = checkPlanQuality(plan({ tasks: [task({ methodHint: "" })] }));
  assert.ok(issues.some((issue) => issue.includes("缺少 methodHint")));
});

test("空泛的 methodHint 会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task({ methodHint: "按计划推进，根据情况调整" })] }),
  );
  assert.ok(issues.some((issue) => issue.includes("空泛做法")));
});

test("缺少默认推荐和执行路径会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({
      tasks: [
        task({
          recommendation: "",
          executionSteps: [],
          fallback: "",
        }),
      ],
    }),
  );
  assert.ok(issues.some((issue) => issue.includes("recommendation")));
  assert.ok(issues.some((issue) => issue.includes("executionSteps")));
  assert.ok(issues.some((issue) => issue.includes("fallback")));
});

test("shortTitle 直接截断标题会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({
      tasks: [task({ title: "整理上周的用户访谈记录", shortTitle: "整理上周的用" })],
    }),
  );
  assert.ok(issues.some((issue) => issue.includes("截断")));
});

test("shortTitle 与标题完全相同会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task({ title: "整理访谈", shortTitle: "整理访谈" })] }),
  );
  assert.ok(issues.some((issue) => issue.includes("完全相同")));
});

test("空泛说法会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ projectObjective: "先做一个初版", projectMilestone: "先确认方向" }),
  );
  assert.ok(issues.some((issue) => issue.includes("空泛说法")));
});

test("模板句会被抓出来", () => {
  const issues = checkPlanQuality(
    plan({ reason: "我大概知道你真正看重什么了，所以先这样安排" }),
  );
  assert.ok(issues.some((issue) => issue.includes("模板句")));
});

test("tasks 里混入非对象元素不会让它崩", () => {
  const issues = checkPlanQuality(plan({ tasks: [null, 42, task()] }));
  assert.deepEqual(issues, []);
});

test("回归门禁：基线通过、这次失败才算回归", () => {
  const result = compareAgainstBaseline(
    [
      { id: "a", pass: true, failures: [], taskCount: 3 },
      { id: "b", pass: false, failures: ["任务数超限"], taskCount: 6 },
      { id: "c", pass: true, failures: [], taskCount: 2 },
    ],
    [
      { id: "a", pass: false, failures: ["出现模板句"], taskCount: 3 },
      { id: "b", pass: true, failures: [], taskCount: 3 },
      { id: "c", pass: true, failures: [], taskCount: 4 },
    ],
  );

  assert.deepEqual(result.newFailures, [
    { id: "a", before: [], after: ["出现模板句"] },
  ]);
  assert.deepEqual(result.fixed, ["b"]);
  assert.deepEqual(result.taskCountChanged, [{ id: "c", before: 2, after: 4 }]);
  assert.deepEqual(result.added, []);
});

test("回归门禁：新增用例不算回归", () => {
  const result = compareAgainstBaseline(
    [{ id: "a", pass: true }],
    [{ id: "a", pass: true }, { id: "brand-new", pass: false, failures: ["x"] }],
  );
  assert.deepEqual(result.newFailures, []);
  assert.deepEqual(result.added, ["brand-new"]);
});

test("回归门禁：一直失败的用例不算新增回归", () => {
  const result = compareAgainstBaseline(
    [{ id: "a", pass: false, failures: ["旧问题"] }],
    [{ id: "a", pass: false, failures: ["旧问题"] }],
  );
  assert.deepEqual(result.newFailures, []);
  assert.deepEqual(result.fixed, []);
});

test("合格的澄清会通过结构检查", () => {
  assert.deepEqual(
    checkClarificationQuality(
      {
        done: false,
        frame: {
          surfaceRequest: "想给个人网站先做作品集还是博客",
          coreNeedHypothesis: "先用一个能展示方向和能力的页面拿到反馈",
          decisionFork: "先做作品集还是先做博客",
          decisiveUnknown: "网站第一版最需要服务谁",
          whyItChangesPlan: "答案会改变首页结构和第一条任务",
          readiness: "ready",
          missingSlots: [],
          completionPrompt: "",
          completionOptions: [],
        },
        reflection: "",
        question: {
          key: "goal",
          question: "个人网站第一版是想让招聘方快速看到作品，还是让读者持续看文章？",
          options: ["先服务招聘方", "先服务长期读者"],
        },
        summary: null,
      },
      { originalIdea: "我想做一个个人网站，可能是作品集也可能是博客" },
    ),
    [],
  );
});

test("通用澄清问句和重复问题会被抓出来", () => {
  const issues = checkClarificationQuality(
    {
      done: false,
      frame: {
        surfaceRequest: "想做一个个人网站",
        coreNeedHypothesis: "先确定网站服务谁",
        decisionFork: "作品集还是博客",
        decisiveUnknown: "访客是谁",
        whyItChangesPlan: "会影响首页结构",
        readiness: "ready",
        missingSlots: [],
        completionPrompt: "",
        completionOptions: [],
      },
      question: {
        key: "goal",
        question: "你最想要什么？",
        options: ["作品集", "博客"],
      },
    },
    {
      originalIdea: "我想做一个个人网站，可能是作品集也可能是博客",
      previousQuestions: ["你最想要什么？"],
    },
  );
  assert.ok(issues.some((issue) => issue.includes("通用问句")));
  assert.ok(issues.some((issue) => issue.includes("重复")));
});

test("结束时留下待确认问题会判定为没有收口", () => {
  const issues = checkClarificationQuality({
    done: true,
    frame: {
      surfaceRequest: "想做一个个人网站",
      coreNeedHypothesis: "先确定网站服务谁",
      decisionFork: "作品集还是博客",
      decisiveUnknown: "访客是谁",
      whyItChangesPlan: "会影响首页结构",
      readiness: "ready",
      missingSlots: [],
      completionPrompt: "",
      completionOptions: [],
    },
    question: null,
    summary: {
      realProblem: "先确定个人网站的第一批访客",
      workingAssumption: "先按招聘方会看来安排",
      newQuestion: "要不要做博客？",
    },
  });
  assert.ok(issues.some((issue) => issue.includes("新问题")));
});

test("用户明确列出多个并列对象时，最多六个具体选项可以通过", () => {
  const issues = checkClarificationQuality(
    {
      done: false,
      frame: {
        surfaceRequest: "用户在六个目标之间摇摆",
        coreNeedHypothesis: "先选一个主线，其他方向先降级",
        decisionFork: "先保一个主线还是六线并行",
        decisiveUnknown: "哪一个目标最不能停",
        whyItChangesPlan: "会改变任务数量和第一条任务",
        readiness: "ready",
        missingSlots: [],
        completionPrompt: "",
        completionOptions: [],
      },
      question: {
        key: "tradeoff",
        question: "学 AI、做个人网站、运营账号、学英语、健身、准备课程里，如果只能先保一个，你想先保哪个？",
        options: ["学 AI", "做个人网站", "运营账号", "学英语", "健身", "准备课程"],
      },
    },
    {
      originalIdea: "我想学 AI、做个人网站、运营账号、学英语、健身、准备课程，但推进不下去。",
    },
  );
  assert.deepEqual(issues, []);
});

test("输入不完整但缺少补全槽位会被抓出来", () => {
  const issues = checkClarificationQuality({
    done: false,
    frame: {
      surfaceRequest: "我有一个计划，但不知道干什么。",
      coreNeedHypothesis: "用户需要先把真实事情说出来",
      decisionFork: "我不知道具体是什么，还是知道但一直没动",
      decisiveUnknown: "这件事具体指什么",
      whyItChangesPlan: "会决定先补全对象还是先处理阻力",
      readiness: "needs_meaning",
      missingSlots: [],
      completionPrompt: "",
      completionOptions: [],
    },
    question: {
      key: "context",
      question: "这件事具体指什么？",
      options: ["我也不知道", "我知道但没动"],
    },
  });
  assert.ok(issues.some((issue) => issue.includes("missingSlots")));
  assert.ok(issues.some((issue) => issue.includes("completionPrompt")));
  assert.ok(issues.some((issue) => issue.includes("completionOptions")));
});

test("问句本身通用、但选项带上用户的对象时，不算没有引用原话", () => {
  const frame = {
    surfaceRequest: "朋友让我帮他的公司做个官网，我不知道该不该接",
    coreNeedHypothesis: "用户要先判断自己现在有没有条件接这个活",
    decisionFork: "接下来做还是推掉",
    decisiveUnknown: "用户手上的时间和精力够不够",
    whyItChangesPlan: "会决定第一条任务是排期还是婉拒",
    readiness: "ready",
    missingSlots: [],
    completionPrompt: "",
    completionOptions: [],
  };
  const context = {
    originalIdea: "朋友让我帮他的公司做个官网，我不知道该不该接。",
  };

  const withOptions = checkClarificationQuality(
    {
      done: false,
      frame,
      question: {
        key: "constraint",
        question: "你现在最卡的是哪一点？",
        options: [
          "怕占太多时间，影响自己手头的事",
          "朋友没提钱，不知道算帮忙还是接活",
        ],
      },
    },
    context,
  );
  assert.equal(
    withOptions.includes("问题没有引用用户原话里的具体对象"),
    false,
  );

  const withoutOptions = checkClarificationQuality(
    {
      done: false,
      frame,
      question: { key: "constraint", question: "你现在最卡的是哪一点？", options: [] },
    },
    context,
  );
  assert.ok(
    withoutOptions.includes("问题没有引用用户原话里的具体对象"),
    "没有任何具体线索时仍要报出来",
  );
});

test("同一目标下的两个子步骤选择会被拦住", () => {
  const issues = checkClarificationQuality(
    {
      done: false,
      frame: {
        surfaceRequest: "不知道怎么和上级沟通进度和困难",
        coreNeedHypothesis: "先建立一条低风险的同步路径",
        decisionFork: "遇到困难不敢说还是进度不知道何时同步",
        decisiveUnknown: "上级更常通过什么方式了解进度",
        whyItChangesPlan: "会改变第一次同步的对象和方式",
        readiness: "ready",
        missingSlots: [],
        completionPrompt: "",
        completionOptions: [],
      },
      question: {
        key: "timing",
        question: "你更想先解决遇到困难时不敢及时开口，还是日常进度不知道什么时候该同步？",
        options: ["遇到困难不敢及时说", "日常进度不知何时同步"],
      },
    },
    { originalIdea: "刚进入职场，不知道怎样和上级沟通进度和困难，总想等做完再说。" },
  );
  assert.ok(issues.some((issue) => issue.includes("两个子步骤")));
});

test("把「先想清楚」当任务会被拦住", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task({ title: "先想清楚要不要换工作再动手" })] }),
  );
  assert.ok(issues.some((issue) => issue.includes("把「想」当成任务动作")));
});

test("完成标准还停在「想」也会被拦住", () => {
  const issues = checkPlanQuality(
    plan({ tasks: [task({ doneWhen: "先想明白这件事值不值得做" })] }),
  );
  assert.ok(issues.some((issue) => issue.includes("完成标准还停在「想」")));
});
