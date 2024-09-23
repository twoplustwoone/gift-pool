-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UsersInGiftGroups" (
    "userId" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    "budget" REAL NOT NULL DEFAULT 0.0,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "giftGroupId"),
    CONSTRAINT "UsersInGiftGroups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsersInGiftGroups_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UsersInGiftGroups" ("budget", "giftGroupId", "joinedAt", "role", "userId") SELECT "budget", "giftGroupId", "joinedAt", "role", "userId" FROM "UsersInGiftGroups";
DROP TABLE "UsersInGiftGroups";
ALTER TABLE "new_UsersInGiftGroups" RENAME TO "UsersInGiftGroups";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
