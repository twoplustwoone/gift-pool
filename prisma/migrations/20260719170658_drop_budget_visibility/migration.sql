-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    CONSTRAINT "Group_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Group" ("createdAt", "createdById", "description", "id", "name", "updatedAt") SELECT "createdAt", "createdById", "description", "id", "name", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE INDEX "Group_createdById_idx" ON "Group"("createdById");
CREATE TABLE "new_UsersInGiftGroups" (
    "userId" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    "contributionCents" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "shareWishlist" BOOLEAN NOT NULL DEFAULT true,
    "shareBirthday" BOOLEAN NOT NULL DEFAULT true,
    "bannedUntil" DATETIME,
    "removedAt" DATETIME,
    "removedById" TEXT,
    "removedReason" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "giftGroupId"),
    CONSTRAINT "UsersInGiftGroups_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UsersInGiftGroups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UsersInGiftGroups" ("bannedUntil", "contributionCents", "giftGroupId", "joinedAt", "removedAt", "removedById", "removedReason", "role", "shareBirthday", "shareWishlist", "userId") SELECT "bannedUntil", "contributionCents", "giftGroupId", "joinedAt", "removedAt", "removedById", "removedReason", "role", "shareBirthday", "shareWishlist", "userId" FROM "UsersInGiftGroups";
DROP TABLE "UsersInGiftGroups";
ALTER TABLE "new_UsersInGiftGroups" RENAME TO "UsersInGiftGroups";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

