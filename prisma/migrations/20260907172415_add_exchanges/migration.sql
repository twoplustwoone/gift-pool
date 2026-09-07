-- CreateTable
CREATE TABLE "Exchange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL DEFAULT 'HOLIDAY',
    "eventDate" DATETIME NOT NULL,
    "spendingGuideline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GATHERING',
    "revealMode" TEXT NOT NULL DEFAULT 'ORGANIZER',
    "autoRevealAt" DATETIME,
    "avoidRepeatsLookback" INTEGER,
    "giftGroupId" TEXT,
    "organizerId" TEXT NOT NULL,
    "inviteCode" TEXT,
    "drawnAt" DATETIME,
    "revealedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    CONSTRAINT "Exchange_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Exchange_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "joinedAt" DATETIME,
    "leftAt" DATETIME,
    "assignmentViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeParticipant_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeExclusion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeExclusion_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeExclusion_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeExclusion_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeId" TEXT NOT NULL,
    "gifterId" TEXT NOT NULL,
    "gifteeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" DATETIME,
    "giftStage" TEXT NOT NULL DEFAULT 'NONE',
    "giftStageAt" DATETIME,
    "giftLabel" TEXT,
    "receivedAt" DATETIME,
    "outcome" TEXT,
    CONSTRAINT "ExchangeAssignment_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeAssignment_gifterId_fkey" FOREIGN KEY ("gifterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeAssignment_gifteeId_fkey" FOREIGN KEY ("gifteeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeJoinPromptDismissal" (
    "exchangeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("exchangeId", "userId"),
    CONSTRAINT "ExchangeJoinPromptDismissal_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeJoinPromptDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_inviteCode_key" ON "Exchange"("inviteCode");

-- CreateIndex
CREATE INDEX "Exchange_giftGroupId_idx" ON "Exchange"("giftGroupId");

-- CreateIndex
CREATE INDEX "Exchange_organizerId_idx" ON "Exchange"("organizerId");

-- CreateIndex
CREATE INDEX "Exchange_status_autoRevealAt_idx" ON "Exchange"("status", "autoRevealAt");

-- CreateIndex
CREATE INDEX "ExchangeParticipant_exchangeId_status_idx" ON "ExchangeParticipant"("exchangeId", "status");

-- CreateIndex
CREATE INDEX "ExchangeParticipant_userId_idx" ON "ExchangeParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeParticipant_exchangeId_userId_key" ON "ExchangeParticipant"("exchangeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeExclusion_exchangeId_userAId_userBId_key" ON "ExchangeExclusion"("exchangeId", "userAId", "userBId");

-- CreateIndex
CREATE INDEX "ExchangeAssignment_exchangeId_gifterId_idx" ON "ExchangeAssignment"("exchangeId", "gifterId");

-- CreateIndex
CREATE INDEX "ExchangeAssignment_exchangeId_gifteeId_idx" ON "ExchangeAssignment"("exchangeId", "gifteeId");

-- One live gifter row and one live giftee row per person per exchange. Prisma
-- cannot express partial unique indexes, so these are hand-written; a future
-- migration that rebuilds ExchangeAssignment must carry them forward.
-- Guarded by app/utils/exchange-schema.test.ts.
CREATE UNIQUE INDEX "ExchangeAssignment_live_gifter_key" ON "ExchangeAssignment"("exchangeId", "gifterId") WHERE "supersededAt" IS NULL;
CREATE UNIQUE INDEX "ExchangeAssignment_live_giftee_key" ON "ExchangeAssignment"("exchangeId", "gifteeId") WHERE "supersededAt" IS NULL;
