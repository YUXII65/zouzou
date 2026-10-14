-- AlterTable
ALTER TABLE "projects" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'normal';

-- AlterTable
ALTER TABLE "inbox_items" ADD COLUMN "mode" TEXT;