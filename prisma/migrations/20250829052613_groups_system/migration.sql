/*
  Warnings:

  - You are about to drop the column `contributionLimit` on the `UsersInGiftGroups` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "JoinRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "giftGroupId" TEXT NOT NULL,
    "invitationId" TEXT,
    "userId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    CONSTRAINT "JoinRequest_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JoinRequest_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "GroupInvitation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offsetDays" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    CONSTRAINT "GroupReminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupReminder_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    CONSTRAINT "GroupActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupActivity_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GiftPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "recipientUserId" TEXT NOT NULL,
    "birthdayDate" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "lockedById" TEXT,
    "budgetSnapshot" TEXT,
    "giftGroupId" TEXT NOT NULL,
    CONSTRAINT "GiftPlan_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GiftPlan_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GiftPlan_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetVisibility" TEXT NOT NULL DEFAULT 'EVERYONE'
);
INSERT INTO "new_Group" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE TABLE "new_GroupInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "roleGranted" TEXT NOT NULL DEFAULT 'MEMBER',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" DATETIME,
    "giftGroupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "GroupInvitation_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GroupInvitation" ("code", "createdAt", "createdById", "expiresAt", "giftGroupId", "id") SELECT "code", "createdAt", "createdById", "expiresAt", "giftGroupId", "id" FROM "GroupInvitation";
DROP TABLE "GroupInvitation";
ALTER TABLE "new_GroupInvitation" RENAME TO "GroupInvitation";
CREATE UNIQUE INDEX "GroupInvitation_code_key" ON "GroupInvitation"("code");
CREATE INDEX "GroupInvitation_code_idx" ON "GroupInvitation"("code");
CREATE TABLE "new_UsersInGiftGroups" (
    "userId" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    "contributionCents" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "budgetVisibilityOverride" TEXT,
    "shareWishlist" BOOLEAN NOT NULL DEFAULT true,
    "shareBirthday" BOOLEAN NOT NULL DEFAULT true,
    "bannedUntil" DATETIME,
    "removedAt" DATETIME,
    "removedById" TEXT,
    "removedReason" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "giftGroupId"),
    CONSTRAINT "UsersInGiftGroups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsersInGiftGroups_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UsersInGiftGroups" ("giftGroupId", "joinedAt", "role", "userId") SELECT "giftGroupId", "joinedAt", "role", "userId" FROM "UsersInGiftGroups";
DROP TABLE "UsersInGiftGroups";
ALTER TABLE "new_UsersInGiftGroups" RENAME TO "UsersInGiftGroups";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
