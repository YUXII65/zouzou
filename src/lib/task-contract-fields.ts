import type { Priority } from "@prisma/client";
import { buildTaskContract } from "@/lib/task-contract";

/**
 * 任务执行合同字段的唯一规范化实现。
 *
 * 网页 server action（编辑任务 / 确认计划 / 阶段推进）和小程序任务接口
 * 都要把「怎么做」这层合同落到数据库字段上，规则必须一致：
 * 优先用调用方给的值，缺失或非法时按标题和备注重新推断。
 */
export const TASK_EXECUTION_MODES = [
  "quick",
  "tool",
  "produce",
  "explore",
  "project",
] as const;
export const TASK_TOOL_POLICIES = ["none", "read", "confirm-write"] as const;

const priorities: Priority[] = ["low", "medium", "high", "urgent"];

export function priority(value: string): Priority {
  return priorities.includes(value as Priority)
    ? (value as Priority)
    : "medium";
}

export function taskContractData(input: {
  title: string;
  notes?: string | null;
  executionMode?: FormDataEntryValue | null;
  doneWhen?: FormDataEntryValue | null;
  methodHint?: FormDataEntryValue | null;
  maxTurns?: FormDataEntryValue | number | null;
  toolPolicy?: FormDataEntryValue | null;
}) {
  const inferred = buildTaskContract(
    `${input.title} ${input.notes ?? ""}`.trim(),
    input.title,
  );
  const rawMode =
    typeof input.executionMode === "string" ? input.executionMode : "";
  const rawPolicy =
    typeof input.toolPolicy === "string" ? input.toolPolicy : "";
  const rawDoneWhen =
    typeof input.doneWhen === "string" ? input.doneWhen.trim() : "";
  const rawMethodHint =
    typeof input.methodHint === "string" ? input.methodHint.trim() : "";
  const rawMaxTurns = Number(
    typeof input.maxTurns === "string" || typeof input.maxTurns === "number"
      ? input.maxTurns
      : Number.NaN,
  );

  return {
    executionMode: (TASK_EXECUTION_MODES as readonly string[]).includes(rawMode)
      ? rawMode
      : inferred.executionMode,
    doneWhen: rawDoneWhen || inferred.doneWhen,
    methodHint: rawMethodHint
      ? rawMethodHint.slice(0, 240)
      : inferred.methodHint,
    maxTurns:
      Number.isFinite(rawMaxTurns) && rawMaxTurns > 0
        ? Math.min(Math.floor(rawMaxTurns), 5)
        : inferred.maxTurns,
    toolPolicy: (TASK_TOOL_POLICIES as readonly string[]).includes(rawPolicy)
      ? rawPolicy
      : inferred.toolPolicy,
  };
}