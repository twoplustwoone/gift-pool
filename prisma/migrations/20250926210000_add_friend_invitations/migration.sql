-- CreateTable
CREATE TABLE "FriendInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "usedById" TEXT,
    "usedAt" DATETIME,
    CONSTRAINT "FriendInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FriendInvitation_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendInvitation_code_key" ON "FriendInvitation"("code");

-- CreateIndex
CREATE INDEX "FriendInvitation_code_idx" ON "FriendInvitation"("code");

