-- AlterTable
ALTER TABLE "User" ADD COLUMN "timeZone" TEXT;

-- CreateTable
CREATE TABLE "ExchangeNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exchangeId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "presetKey" TEXT NOT NULL,
    "renderedText" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "deliveredAt" DATETIME,
    CONSTRAINT "ExchangeNote_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeNote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ExchangeAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeNote_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeGuess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exchangeId" TEXT NOT NULL,
    "guesserId" TEXT NOT NULL,
    "guessedUserId" TEXT NOT NULL,
    "firstGuessedUserId" TEXT NOT NULL,
    "firstGuessedAt" DATETIME NOT NULL,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ExchangeGuess_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeGuess_guesserId_fkey" FOREIGN KEY ("guesserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeGuess_guessedUserId_fkey" FOREIGN KEY ("guessedUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExchangeNote_exchangeId_threadId_idx" ON "ExchangeNote"("exchangeId", "threadId");

-- CreateIndex
CREATE INDEX "ExchangeNote_exchangeId_senderId_createdAt_idx" ON "ExchangeNote"("exchangeId", "senderId", "createdAt");

-- CreateIndex
CREATE INDEX "ExchangeNote_deliveredAt_scheduledFor_idx" ON "ExchangeNote"("deliveredAt", "scheduledFor");

-- CreateIndex
CREATE INDEX "ExchangeGuess_exchangeId_idx" ON "ExchangeGuess"("exchangeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeGuess_exchangeId_guesserId_key" ON "ExchangeGuess"("exchangeId", "guesserId");
