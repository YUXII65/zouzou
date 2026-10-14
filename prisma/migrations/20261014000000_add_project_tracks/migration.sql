-- CreateTable
CREATE TABLE "project_tracks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'main',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentFocus" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tracks_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "trackId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "project_tracks_projectId_order_key" ON "project_tracks"("projectId", "order");

-- CreateIndex
CREATE INDEX "project_tracks_userId_status_idx" ON "project_tracks"("userId", "status");

-- CreateIndex
CREATE INDEX "project_tracks_projectId_status_idx" ON "project_tracks"("projectId", "status");

-- CreateIndex
CREATE INDEX "tasks_trackId_idx" ON "tasks"("trackId");

-- AddForeignKey
ALTER TABLE "project_tracks" ADD CONSTRAINT "project_tracks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tracks" ADD CONSTRAINT "project_tracks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "project_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
