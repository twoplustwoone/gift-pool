-- Rename WishlistPurchase to WishlistClaim (lossless rename, preserves existing rows)
ALTER TABLE "WishlistPurchase" RENAME TO "WishlistClaim";
ALTER TABLE "WishlistClaim" RENAME COLUMN "purchasedById" TO "claimedByUserId";
DROP INDEX IF EXISTS "WishlistPurchase_wishlistItemId_key";
DROP INDEX IF EXISTS "WishlistPurchase_purchasedById_idx";
CREATE UNIQUE INDEX "WishlistClaim_wishlistItemId_key" ON "WishlistClaim"("wishlistItemId");
CREATE INDEX "WishlistClaim_claimedByUserId_idx" ON "WishlistClaim"("claimedByUserId");
