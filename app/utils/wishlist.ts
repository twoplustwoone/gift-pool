import { z } from 'zod';

export const wishlistItemStatuses = ['ACTIVE', 'ARCHIVED'] as const;

export const wishlistItemStatusSchema = z.enum(wishlistItemStatuses);

export type WishlistItemStatusValue = (typeof wishlistItemStatuses)[number];

export function isWishlistItemActive(status?: WishlistItemStatusValue | null) {
  return status === 'ACTIVE' || typeof status === 'undefined' || status === null;
}
