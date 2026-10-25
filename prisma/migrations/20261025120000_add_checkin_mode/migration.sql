-- AlterTable
ALTER TABLE "projects" ADD COLUMN "checkinOwnerId" TEXT;

-- CreateTable
CREATE TABLE "task_checkin_completions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "checkinDate" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_checkin_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_checkinOwnerId_key" ON "projects"("checkinOwnerId");

-- CreateIndex
CREATE UNIQUE INDEX "task_checkin_completions_taskId_checkinDate_key" ON "task_checkin_completions"("taskId", "checkinDate");

-- CreateIndex
CREATE INDEX "task_checkin_completions_userId_checkinDate_idx" ON "task_checkin_completions"("userId", "checkinDate");

-- AddForeignKey
ALTER TABLE "task_checkin_completions" ADD CONSTRAINT "task_checkin_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checkin_completions" ADD CONSTRAINT "task_checkin_completions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
