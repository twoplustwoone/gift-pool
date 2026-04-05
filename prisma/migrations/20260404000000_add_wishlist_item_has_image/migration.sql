-- AlterTable: add hasImage column and backfill from existing image data
ALTER TABLE "WishlistItem" ADD COLUMN "hasImage" BOOLEAN NOT NULL DEFAULT false;
UPDATE "WishlistItem" SET "hasImage" = true WHERE "image" IS NOT NULL;
