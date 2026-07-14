-- CreateTable
CREATE TABLE "PoolInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" DATETIME,
    "cancelledAt" DATETIME,
    "poolId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    CONSTRAINT "PoolInvitation_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PoolInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PoolInvitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add the owned invitation relation to actionable notifications.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "messageKey" TEXT NOT NULL,
    "messageParams" TEXT,
    "targetUrl" TEXT,
    "metadata" TEXT,
    "actions" TEXT,
    "friendRequestId" TEXT,
    "poolInvitationId" TEXT,
    "sourceIdentifier" TEXT,
    CONSTRAINT "Notification_friendRequestId_fkey" FOREIGN KEY ("friendRequestId") REFERENCES "FriendRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_poolInvitationId_fkey" FOREIGN KEY ("poolInvitationId") REFERENCES "PoolInvitation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Notification" (
    "actions", "createdAt", "friendRequestId", "id", "messageKey",
    "messageParams", "metadata", "readAt", "sourceIdentifier", "status",
    "targetUrl", "type", "userId"
)
SELECT
    "actions", "createdAt", "friendRequestId", "id", "messageKey",
    "messageParams", "metadata", "readAt", "sourceIdentifier", "status",
    "targetUrl", "type", "userId"
FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE UNIQUE INDEX "Notification_friendRequestId_key" ON "Notification"("friendRequestId");
CREATE UNIQUE INDEX "Notification_poolInvitationId_key" ON "Notification"("poolInvitationId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PoolInvitation_poolId_inviteeId_key" ON "PoolInvitation"("poolId", "inviteeId");
CREATE INDEX "PoolInvitation_poolId_status_idx" ON "PoolInvitation"("poolId", "status");
CREATE INDEX "PoolInvitation_inviteeId_status_idx" ON "PoolInvitation"("inviteeId", "status");
CREATE INDEX "PoolInvitation_invitedById_idx" ON "PoolInvitation"("invitedById");
