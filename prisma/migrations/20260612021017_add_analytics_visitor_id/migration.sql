-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN "visitorId" TEXT;

-- CreateIndex
CREATE INDEX "AnalyticsEvent_visitorId_createdAt_idx" ON "AnalyticsEvent"("visitorId", "createdAt");
