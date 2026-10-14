-- CreateEnum
CREATE TYPE "ProjectStageStatus" AS ENUM ('active', 'ready', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "project_stages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "doneWhen" TEXT,
    "status" "ProjectStageStatus" NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_stages_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "stageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "project_stages_projectId_order_key" ON "project_stages"("projectId", "order");

-- CreateIndex
CREATE INDEX "project_stages_userId_status_idx" ON "project_stages"("userId", "status");

-- CreateIndex
CREATE INDEX "project_stages_projectId_status_idx" ON "project_stages"("projectId", "status");

-- CreateIndex
CREATE INDEX "tasks_stageId_idx" ON "tasks"("stageId");

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "project_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
