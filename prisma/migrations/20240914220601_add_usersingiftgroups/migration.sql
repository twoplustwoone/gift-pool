/*
  Warnings:

  - You are about to drop the `UserGroup` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `name` to the `Group` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "UserGroup_userId_groupId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserGroup";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "UsersInGiftGroups" (
    "userId" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    "budget" REAL NOT NULL DEFAULT 0.0,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "giftGroupId"),
    CONSTRAINT "UsersInGiftGroups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsersInGiftGroups_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL
);
INSERT INTO "new_Group" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
