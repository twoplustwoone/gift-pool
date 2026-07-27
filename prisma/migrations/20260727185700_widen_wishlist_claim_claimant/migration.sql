PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WishlistClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wishlistItemId" TEXT NOT NULL,
    "claimedByUserId" TEXT,
    "poolId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeFeedback" TEXT,
    CONSTRAINT "WishlistClaim_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistClaim_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistClaim_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistClaim_exactly_one_claimant" CHECK (("claimedByUserId" IS NOT NULL) + ("poolId" IS NOT NULL) = 1)
);

-- Existing rows already have a user claimant and no pool, which is the correct
-- final state. No backfill.
INSERT INTO "new_WishlistClaim" ("id","wishlistItemId","claimedByUserId","createdAt","outcomeFeedback")
SELECT "id","wishlistItemId","claimedByUserId","createdAt","outcomeFeedback" FROM "WishlistClaim";

DROP TABLE "WishlistClaim";
ALTER TABLE "new_WishlistClaim" RENAME TO "WishlistClaim";

CREATE UNIQUE INDEX "WishlistClaim_wishlistItemId_key" ON "WishlistClaim"("wishlistItemId");
CREATE INDEX "WishlistClaim_claimedByUserId_idx" ON "WishlistClaim"("claimedByUserId");
CREATE INDEX "WishlistClaim_poolId_idx" ON "WishlistClaim"("poolId");

PRAGMA foreign_keys=ON;
