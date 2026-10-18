-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "nextTaskJson" TEXT;
ALTER TABLE "tasks" ADD COLUMN "nextTaskUpdatedAt" TIMESTAMP(3);
