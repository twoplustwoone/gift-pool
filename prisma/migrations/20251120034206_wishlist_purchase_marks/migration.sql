-- CreateTable
CREATE TABLE "WishlistPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wishlistItemId" TEXT NOT NULL,
    "purchasedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishlistPurchase_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistPurchase_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WishlistPurchase_wishlistItemId_key" ON "WishlistPurchase"("wishlistItemId");

-- CreateIndex
CREATE INDEX "WishlistPurchase_purchasedById_idx" ON "WishlistPurchase"("purchasedById");
