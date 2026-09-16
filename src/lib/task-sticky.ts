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
