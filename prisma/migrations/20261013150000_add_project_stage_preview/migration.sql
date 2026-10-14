-- AlterTable
ALTER TABLE "project_stages" ADD COLUMN "nextStageJson" TEXT;
ALTER TABLE "project_stages" ADD COLUMN "nextStageUpdatedAt" TIMESTAMP(3);
