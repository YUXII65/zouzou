-- AlterTable
ALTER TABLE "projects" ADD COLUMN "cadence" TEXT;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "projectId" TEXT;

-- DropIndex
DROP INDEX "reviews_userId_reviewDate_key";

-- CreateIndex
CREATE UNIQUE INDEX "reviews_userId_reviewDate_projectId_key" ON "reviews"("userId", "reviewDate", "projectId");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
