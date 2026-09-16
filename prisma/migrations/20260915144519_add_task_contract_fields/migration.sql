-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completedBy" TEXT,
ADD COLUMN     "doneWhen" TEXT,
ADD COLUMN     "executionMode" TEXT,
ADD COLUMN     "maxTurns" INTEGER,
ADD COLUMN     "toolPolicy" TEXT;
