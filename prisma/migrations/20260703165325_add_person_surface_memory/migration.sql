-- AlterTable
ALTER TABLE "Pool" ADD COLUMN "outcomeFeedback" TEXT;

-- AlterTable
ALTER TABLE "WishlistPurchase" ADD COLUMN "outcomeFeedback" TEXT;

-- CreateTable
CREATE TABLE "GiftListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "priceCents" INTEGER,
    "currency" TEXT,
    CONSTRAINT "GiftListItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GiftListItem_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    CONSTRAINT "PersonNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonNote_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OccasionDecline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL DEFAULT 'BIRTHDAY',
    "occasionYear" INTEGER NOT NULL,
    CONSTRAINT "OccasionDecline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OccasionDecline_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GiftIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "poolId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "estimatedPriceCents" INTEGER,
    "wishlistItemId" TEXT,
    "giftListItemId" TEXT,
    CONSTRAINT "GiftIdea_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GiftIdea_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GiftIdea_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GiftIdea_giftListItemId_fkey" FOREIGN KEY ("giftListItemId") REFERENCES "GiftListItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GiftIdea" ("createdAt", "description", "estimatedPriceCents", "id", "name", "poolId", "proposedById", "updatedAt", "url", "wishlistItemId") SELECT "createdAt", "description", "estimatedPriceCents", "id", "name", "poolId", "proposedById", "updatedAt", "url", "wishlistItemId" FROM "GiftIdea";
DROP TABLE "GiftIdea";
ALTER TABLE "new_GiftIdea" RENAME TO "GiftIdea";
CREATE INDEX "GiftIdea_poolId_idx" ON "GiftIdea"("poolId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GiftListItem_ownerId_targetUserId_idx" ON "GiftListItem"("ownerId", "targetUserId");

-- CreateIndex
CREATE INDEX "PersonNote_authorId_subjectUserId_idx" ON "PersonNote"("authorId", "subjectUserId");

-- CreateIndex
CREATE INDEX "OccasionDecline_userId_idx" ON "OccasionDecline"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OccasionDecline_userId_targetUserId_occasionType_occasionYear_key" ON "OccasionDecline"("userId", "targetUserId", "occasionType", "occasionYear");
