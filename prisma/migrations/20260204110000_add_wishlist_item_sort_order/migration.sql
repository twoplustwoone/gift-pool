-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WishlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "url" TEXT,
    "type" TEXT NOT NULL,
    "image" BLOB,
    "imageSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WishlistItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WishlistCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WishlistItem" (
    "id",
    "ownerId",
    "categoryId",
    "sortOrder",
    "title",
    "note",
    "url",
    "type",
    "image",
    "imageSource",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    wi."id",
    wi."ownerId",
    wi."categoryId",
    (
        SELECT COUNT(*)
        FROM "WishlistItem" wi2
        WHERE wi2."ownerId" = wi."ownerId"
          AND (
            (wi2."categoryId" IS NULL AND wi."categoryId" IS NULL)
            OR wi2."categoryId" = wi."categoryId"
          )
          AND (
            wi2."createdAt" < wi."createdAt"
            OR (wi2."createdAt" = wi."createdAt" AND wi2."id" < wi."id")
          )
    ) AS "sortOrder",
    wi."title",
    wi."note",
    wi."url",
    wi."type",
    wi."image",
    wi."imageSource",
    wi."status",
    wi."createdAt",
    wi."updatedAt"
FROM "WishlistItem" wi;
DROP TABLE "WishlistItem";
ALTER TABLE "new_WishlistItem" RENAME TO "WishlistItem";
CREATE INDEX "WishlistItem_ownerId_categoryId_sortOrder_idx" ON "WishlistItem"("ownerId", "categoryId", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
