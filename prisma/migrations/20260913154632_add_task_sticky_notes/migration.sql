-- CreateTable
CREATE TABLE "task_sticky_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceMessage" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "encouragement" TEXT NOT NULL,
    "stepsJson" TEXT NOT NULL,
    "nextStep" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_sticky_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_sticky_notes_userId_taskId_createdAt_idx" ON "task_sticky_notes"("userId", "taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "task_sticky_notes" ADD CONSTRAINT "task_sticky_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_sticky_notes" ADD CONSTRAINT "task_sticky_notes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
