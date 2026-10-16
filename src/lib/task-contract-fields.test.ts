import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priority,
  taskContractData,
} from "@/lib/task-contract-fields";

/**
 * 任务合同字段规范化是网页、阶段推进、小程序任务接口共用的一份实现，
 * 这里锁住它的三条行为：有值用值、非法值回退推断、methodHint 裁剪。
 */
test("任务合同字段：优先用调用方传入的值", () => {
  const contract = taskContractData({
    title: "把访谈整理成方向",
    notes: null,
    executionMode: "produce",
    doneWhen: "别人能直接读到三页结论",
    methodHint: "先列问题，再按主题合并",
    maxTurns: 2,
    toolPolicy: "none",
  });

  assert.equal(contract.executionMode, "produce");
  assert.equal(contract.doneWhen, "别人能直接读到三页结论");
  assert.equal(contract.methodHint, "先列问题，再按主题合并");
  assert.equal(contract.maxTurns, 2);
  assert.equal(contract.toolPolicy, "none");
});

test("任务合同字段：非法值回退到推断结果", () => {
  const contract = taskContractData({
    title: "把访谈整理成方向",
    notes: "",
    executionMode: "not-a-mode",
    maxTurns: -3,
    toolPolicy: "not-a-policy",
  });

  assert.ok(
    ["quick", "tool", "produce", "explore", "project"].includes(
      contract.executionMode,
    ),
  );
  assert.ok(contract.doneWhen.length > 0);
  assert.ok(contract.methodHint.length > 0);
  assert.ok(contract.maxTurns >= 1);
  assert.equal(contract.toolPolicy, "none");
});

test("任务合同字段：methodHint 裁剪到 240 字", () => {
  const contract = taskContractData({
    title: "写一版方案",
    methodHint: "长".repeat(500),
  });
  assert.equal(contract.methodHint.length, 240);
});

test("任务优先级：合法值保留，非法值回退中", () => {
  assert.equal(priority("high"), "high");
  assert.equal(priority("urgent"), "urgent");
  assert.equal(priority("whatever"), "medium");
});