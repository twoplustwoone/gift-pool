-- CreateTable
CREATE TABLE "WishlistPublicShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishlistPublicShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WishlistPublicShare_ownerId_key" ON "WishlistPublicShare"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistPublicShare_token_key" ON "WishlistPublicShare"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistPublicShare_tokenHash_key" ON "WishlistPublicShare"("tokenHash");
