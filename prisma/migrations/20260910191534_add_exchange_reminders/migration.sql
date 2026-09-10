-- CreateTable
CREATE TABLE "ExchangeReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exchangeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    CONSTRAINT "ExchangeReminder_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeReminder_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExchangeReminder_exchangeId_kind_createdAt_idx" ON "ExchangeReminder"("exchangeId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ExchangeReminder_exchangeId_createdAt_idx" ON "ExchangeReminder"("exchangeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeReminder_senderId_idempotencyKey_key" ON "ExchangeReminder"("senderId", "idempotencyKey");
