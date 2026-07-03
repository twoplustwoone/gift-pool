-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "budgetVisibility" TEXT NOT NULL DEFAULT 'EVERYONE',
    "createdById" TEXT,
    CONSTRAINT "Group_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Group" ("budgetVisibility", "createdAt", "description", "id", "name", "updatedAt") SELECT "budgetVisibility", "createdAt", "description", "id", "name", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE INDEX "Group_createdById_idx" ON "Group"("createdById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill createdById by INFERENCE — no authoritative creator was recorded for
-- historical groups. Prefer the earliest-joined OWNER; else the earliest-joined
-- member; else leave NULL.
UPDATE "Group"
SET "createdById" = (
    SELECT u."userId"
    FROM "UsersInGiftGroups" u
    WHERE u."giftGroupId" = "Group"."id"
    ORDER BY (u."role" = 'OWNER') DESC, u."joinedAt" ASC
    LIMIT 1
);
