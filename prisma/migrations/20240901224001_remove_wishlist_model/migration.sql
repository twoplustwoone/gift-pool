/*
  Warnings:

  - You are about to drop the `Wishlist` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `isWishlist` on the `WishlistItem` table. All the data in the column will be lost.
  - You are about to drop the column `link` on the `WishlistItem` table. All the data in the column will be lost.
  - You are about to drop the column `wishlistId` on the `WishlistItem` table. All the data in the column will be lost.
  - Added the required column `value` to the `WishlistItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Wishlist_userId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Wishlist";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WishlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "value" TEXT NOT NULL,
    "isWishlistLink" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_WishlistItem" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "WishlistItem";
DROP TABLE "WishlistItem";
ALTER TABLE "new_WishlistItem" RENAME TO "WishlistItem";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
