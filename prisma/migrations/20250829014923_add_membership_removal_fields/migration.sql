-- AlterTable
ALTER TABLE "UsersInGiftGroups" ADD COLUMN "bannedUntil" DATETIME;
ALTER TABLE "UsersInGiftGroups" ADD COLUMN "removedAt" DATETIME;
ALTER TABLE "UsersInGiftGroups" ADD COLUMN "removedById" TEXT;
ALTER TABLE "UsersInGiftGroups" ADD COLUMN "removedReason" TEXT;
