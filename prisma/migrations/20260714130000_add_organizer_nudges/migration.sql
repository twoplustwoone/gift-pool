CREATE TABLE "OrganizerNudge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poolId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    CONSTRAINT "OrganizerNudge_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizerNudge_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrganizerNudgeRecipient" (
    "nudgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    PRIMARY KEY ("nudgeId", "userId"),
    CONSTRAINT "OrganizerNudgeRecipient_nudgeId_fkey" FOREIGN KEY ("nudgeId") REFERENCES "OrganizerNudge" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizerNudgeRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrganizerNudge_senderId_idempotencyKey_key" ON "OrganizerNudge"("senderId", "idempotencyKey");
CREATE INDEX "OrganizerNudge_poolId_kind_createdAt_idx" ON "OrganizerNudge"("poolId", "kind", "createdAt");
CREATE INDEX "OrganizerNudge_poolId_createdAt_idx" ON "OrganizerNudge"("poolId", "createdAt");
CREATE INDEX "OrganizerNudgeRecipient_userId_idx" ON "OrganizerNudgeRecipient"("userId");
