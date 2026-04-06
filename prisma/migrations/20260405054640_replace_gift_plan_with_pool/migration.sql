/*
  Warnings:

  - You are about to drop the `GiftPlan` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "GiftPlan";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL DEFAULT 'BIRTHDAY',
    "eventDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decisionMode" TEXT NOT NULL DEFAULT 'ORGANIZER_PICKS',
    "recipientUserId" TEXT,
    "recipientName" TEXT,
    "giftGroupId" TEXT,
    "organizerId" TEXT NOT NULL,
    "purchaserId" TEXT,
    "delivererId" TEXT,
    "chosenIdeaId" TEXT,
    "finalPriceCents" INTEGER,
    "inviteCode" TEXT,
    CONSTRAINT "Pool_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pool_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pool_purchaserId_fkey" FOREIGN KEY ("purchaserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pool_delivererId_fkey" FOREIGN KEY ("delivererId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pool_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pool_chosenIdeaId_fkey" FOREIGN KEY ("chosenIdeaId") REFERENCES "GiftIdea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PoolContributor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contributionCents" INTEGER,
    "hasPaid" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PoolContributor_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PoolContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GiftIdea" (
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
    CONSTRAINT "GiftIdea_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GiftIdea_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GiftIdea_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdeaVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poolId" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    CONSTRAINT "IdeaVote_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IdeaVote_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "GiftIdea" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IdeaVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PoolActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poolId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT,
    CONSTRAINT "PoolActivity_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PoolActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PoolMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "poolId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "referencedIdeaId" TEXT,
    CONSTRAINT "PoolMessage_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PoolMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolMessage_referencedIdeaId_fkey" FOREIGN KEY ("referencedIdeaId") REFERENCES "GiftIdea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Pool_chosenIdeaId_key" ON "Pool"("chosenIdeaId");

-- CreateIndex
CREATE UNIQUE INDEX "Pool_inviteCode_key" ON "Pool"("inviteCode");

-- CreateIndex
CREATE INDEX "Pool_giftGroupId_idx" ON "Pool"("giftGroupId");

-- CreateIndex
CREATE INDEX "Pool_organizerId_idx" ON "Pool"("organizerId");

-- CreateIndex
CREATE INDEX "Pool_recipientUserId_idx" ON "Pool"("recipientUserId");

-- CreateIndex
CREATE INDEX "Pool_status_idx" ON "Pool"("status");

-- CreateIndex
CREATE INDEX "PoolContributor_poolId_idx" ON "PoolContributor"("poolId");

-- CreateIndex
CREATE INDEX "PoolContributor_userId_idx" ON "PoolContributor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PoolContributor_poolId_userId_key" ON "PoolContributor"("poolId", "userId");

-- CreateIndex
CREATE INDEX "GiftIdea_poolId_idx" ON "GiftIdea"("poolId");

-- CreateIndex
CREATE INDEX "IdeaVote_ideaId_idx" ON "IdeaVote"("ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaVote_poolId_voterId_key" ON "IdeaVote"("poolId", "voterId");

-- CreateIndex
CREATE INDEX "PoolActivity_poolId_createdAt_idx" ON "PoolActivity"("poolId", "createdAt");

-- CreateIndex
CREATE INDEX "PoolMessage_poolId_createdAt_idx" ON "PoolMessage"("poolId", "createdAt");
