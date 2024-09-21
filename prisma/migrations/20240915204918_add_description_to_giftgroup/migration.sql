/*
  Warnings:

  - Added the required column `description` to the `Group` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL
);
INSERT INTO "new_Group" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE TABLE "new_UsersInGiftGroups" (
    "userId" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    "budget" REAL NOT NULL DEFAULT 0.0,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "giftGroupId"),
    CONSTRAINT "UsersInGiftGroups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsersInGiftGroups_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UsersInGiftGroups" ("budget", "giftGroupId", "joinedAt", "role", "userId") SELECT "budget", "giftGroupId", "joinedAt", "role", "userId" FROM "UsersInGiftGroups";
DROP TABLE "UsersInGiftGroups";
ALTER TABLE "new_UsersInGiftGroups" RENAME TO "UsersInGiftGroups";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
