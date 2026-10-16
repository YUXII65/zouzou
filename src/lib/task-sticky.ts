export type TaskStickyNoteData = {
  id: string;
  taskId: string;
  sourceMessage: string;
  title: string;
  encouragement: string;
  steps: string[];
  nextStep: string;
  createdAt: string;
};

type TaskStickyNoteRecord = {
  id: string;
  taskId: string;
  sourceMessage: string;
  title: string;
  encouragement: string;
  stepsJson: string;
  nextStep: string;
  createdAt: Date | string;
};

export function serializeTaskStickyNote(
  note: TaskStickyNoteRecord,
): TaskStickyNoteData {
  let steps: string[] = [];

  try {
    const parsed = JSON.parse(note.stepsJson) as unknown;
    if (Array.isArray(parsed)) {
      steps = parsed.filter(
        (step): step is string => typeof step === "string" && Boolean(step.trim()),
      );
    }
  } catch {
    steps = [];
  }

  return {
    id: note.id,
    taskId: note.taskId,
    sourceMessage: note.sourceMessage,
    title: note.title,
    encouragement: note.encouragement,
    steps,
    nextStep: note.nextStep,
    createdAt:
      note.createdAt instanceof Date
        ? note.createdAt.toISOString()
        : new Date(note.createdAt).toISOString(),
  };
}

export function stripStickyStepPrefix(value: string) {
  return value
    .replace(
      /^\s*(?:(?:第\s*[一二三四五六七八九十\d]+\s*[步部分]?[:：、.)）]?)|(?:\d{1,2}\s*[.、)）])|(?:\d{1,2}\s+(?!(?:个|件|条|天|周|月|年|小时|分钟|家|次|种|张|页|步|人|份|元|块|公里|岁|本|门|套|款|项|位|名|所|场|局|轮|遍|%)))|(?:[①②③④⑤⑥⑦⑧⑨⑩])|(?:[一二三四五六七八九十]\s*[、.)）]))\s*/u,
      "",
    )
    .trim();
}

export function normalizeStickySteps(
  note: Pick<TaskStickyNoteData, "steps" | "nextStep">,
) {
  return (note.steps.length ? note.steps : [note.nextStep])
    .map(stripStickyStepPrefix)
    .filter(Boolean);
}
