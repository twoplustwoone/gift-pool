import { arrayMove } from '@dnd-kit/sortable';

import { type ClaimDisclosure } from '#app/utils/wishlist-claim-disclosure.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

import { type WishlistCategory } from './wishlist-category-state';

export type WishlistItem = {
  id: string;
  title: string;
  ownerId: string;
  note: string | null;
  url: string | null;
  type: string;
  priceCents?: number | null;
  currency?: string | null;
  categoryId: string | null;
  sortOrder: number;
  updatedAt: Date;
  status: WishlistItemStatusValue;
  // A claim row can hold either a solo claimedByUserId or a pool — see
  // ClaimDescriptor. claimDisclosure is the privacy-laddered read model for
  // non-owner surfaces; owner loaders never populate it (see
  // wishlist-claims.server.ts's loadClaimStates and the "owner never sees
  // claims" rule).
  claim?: { claimedByUserId: string | null } | null;
  claimDisclosure?: ClaimDisclosure;
  hasImage?: boolean;
  imageSource?: WishlistItemImageSource | null;
};

export const DEFAULT_CATEGORY_KEY = 'default';
export const CATEGORY_DRAG_PREFIX = 'category:';
export const ITEM_DRAG_PREFIX = 'item:';
export const CATEGORY_DROP_PREFIX = 'category-drop:';

export const categoryKeyFromId = (categoryId: string | null) =>
  categoryId ?? DEFAULT_CATEGORY_KEY;
export const categoryIdFromKey = (key: string) =>
  key === DEFAULT_CATEGORY_KEY ? null : key;

export const toCategoryDragId = (categoryId: string) =>
  `${CATEGORY_DRAG_PREFIX}${categoryId}`;
export const toItemDragId = (itemId: string) => `${ITEM_DRAG_PREFIX}${itemId}`;
export const toCategoryDropId = (categoryKey: string) =>
  `${CATEGORY_DROP_PREFIX}${categoryKey}`;

export const getCategoryIdFromDragId = (dragId: string) =>
  dragId.startsWith(CATEGORY_DRAG_PREFIX)
    ? dragId.slice(CATEGORY_DRAG_PREFIX.length)
    : null;
export const getItemIdFromDragId = (dragId: string) =>
  dragId.startsWith(ITEM_DRAG_PREFIX)
    ? dragId.slice(ITEM_DRAG_PREFIX.length)
    : null;
export const getCategoryKeyFromDropId = (dropId: string) =>
  dropId.startsWith(CATEGORY_DROP_PREFIX)
    ? dropId.slice(CATEGORY_DROP_PREFIX.length)
    : null;

export const compareItemsBySortOrder = (a: WishlistItem, b: WishlistItem) =>
  a.sortOrder - b.sortOrder ||
  a.updatedAt.getTime() - b.updatedAt.getTime() ||
  a.id.localeCompare(b.id);

export const reorderItemIdsInList = ({
  orderedIds,
  activeId,
  overId,
}: {
  orderedIds: string[];
  activeId: string;
  overId: string;
}) => {
  const activeIndex = orderedIds.indexOf(activeId);
  const overIndex = orderedIds.indexOf(overId);
  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
    return orderedIds;
  }

  return arrayMove(orderedIds, activeIndex, overIndex);
};

export const moveItemIdBetweenLists = ({
  sourceIds,
  targetIds,
  movedId,
  targetIndex,
}: {
  sourceIds: string[];
  targetIds: string[];
  movedId: string;
  targetIndex: number;
}) => {
  const nextSource = sourceIds.filter((id) => id !== movedId);
  const nextTarget = targetIds.filter((id) => id !== movedId);
  const boundedIndex = Math.max(0, Math.min(targetIndex, nextTarget.length));
  nextTarget.splice(boundedIndex, 0, movedId);
  return { sourceIds: nextSource, targetIds: nextTarget };
};

export const cloneItemsSnapshot = (items: WishlistItem[]) =>
  items.map((item) => ({ ...item }));
export const cloneCategoriesSnapshot = (categories: WishlistCategory[]) =>
  categories.map((category) => ({ ...category }));

export const applyCategoryItemOrder = ({
  prevItems,
  categoryId,
  orderedIds,
}: {
  prevItems: WishlistItem[];
  categoryId: string | null;
  orderedIds: string[];
}) => {
  const idSet = new Set(orderedIds);
  const rank = new Map(orderedIds.map((id, index) => [id, index]));

  return prevItems.map((item) => {
    if (!idSet.has(item.id)) return item;
    return {
      ...item,
      categoryId,
      sortOrder: rank.get(item.id) ?? item.sortOrder,
    };
  });
};

export const getNextSortOrder = (
  items: WishlistItem[],
  categoryId: string | null,
) => {
  const max = items
    .filter((item) => item.categoryId === categoryId)
    .reduce((currentMax, item) => Math.max(currentMax, item.sortOrder), -1);
  return max + 1;
};

export const redensifyCategorySortOrder = (
  items: WishlistItem[],
  categoryId: string | null,
) => {
  const ordered = items
    .filter((item) => item.categoryId === categoryId)
    .sort(compareItemsBySortOrder);

  if (ordered.length === 0) return items;

  const nextSortOrder = new Map(ordered.map((item, index) => [item.id, index]));
  return items.map((item) => {
    if (item.categoryId !== categoryId) return item;
    return {
      ...item,
      sortOrder: nextSortOrder.get(item.id) ?? item.sortOrder,
    };
  });
};

export type PendingItemMutation =
  | {
      type: 'upsert';
      clientMutationId: string;
      itemId: string;
      title: string;
      note: string | null;
      url: string | null;
      itemType: string;
      categoryId: string | null;
      hasImage: boolean;
      imageSource: WishlistItemImageSource | null;
      status: WishlistItemStatusValue;
      updatedAt: Date;
    }
  | {
      type: 'delete';
      clientMutationId: string;
      itemId: string;
    };

export type PendingReorderMutation = {
  clientMutationId: string;
  previousItems: WishlistItem[];
  previousCategories: WishlistCategory[];
};

export type PendingStatusMutation = {
  itemId: string;
  previousStatus: WishlistItemStatusValue;
  nextStatus: WishlistItemStatusValue;
  clientMutationId: string;
};

export const normalizeFormActionPath = (action: string | null | undefined) => {
  if (!action) return null;
  try {
    return new URL(action, 'https://gift-pool.local').pathname.replace(
      /\.data$/,
      '',
    );
  } catch {
    return action.replace(/\.data$/, '');
  }
};

export const getFormString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value : null;
};

export const normalizeNullableFormValue = (value: string | null) => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const applyPendingItemMutations = ({
  items,
  pendingMutations,
  ownerId,
}: {
  items: WishlistItem[];
  pendingMutations: PendingItemMutation[];
  ownerId: string;
}) => {
  let nextItems = [...items];

  for (const mutation of pendingMutations) {
    if (mutation.type === 'delete') {
      nextItems = nextItems.filter((item) => item.id !== mutation.itemId);
      continue;
    }

    const existingIndex = nextItems.findIndex(
      (item) => item.id === mutation.itemId,
    );

    if (existingIndex === -1) {
      nextItems.push({
        id: mutation.itemId,
        title: mutation.title,
        ownerId,
        note: mutation.note,
        url: mutation.url,
        type: mutation.itemType,
        categoryId: mutation.categoryId,
        sortOrder: getNextSortOrder(nextItems, mutation.categoryId),
        updatedAt: mutation.updatedAt,
        status: mutation.status,
        hasImage: mutation.hasImage,
        imageSource: mutation.imageSource,
      });
      continue;
    }

    const existingItem = nextItems[existingIndex]!;
    let nextSortOrder = existingItem.sortOrder;
    if (existingItem.categoryId !== mutation.categoryId) {
      const withoutCurrent = nextItems.filter(
        (_, index) => index !== existingIndex,
      );
      nextSortOrder = getNextSortOrder(withoutCurrent, mutation.categoryId);
    }

    nextItems[existingIndex] = {
      ...existingItem,
      title: mutation.title,
      note: mutation.note,
      url: mutation.url,
      type: mutation.itemType,
      categoryId: mutation.categoryId,
      sortOrder: nextSortOrder,
      updatedAt: mutation.updatedAt,
      status: mutation.status,
      hasImage: mutation.hasImage,
      imageSource: mutation.imageSource,
    };

    if (existingItem.categoryId !== mutation.categoryId) {
      nextItems = redensifyCategorySortOrder(
        nextItems,
        existingItem.categoryId,
      );
      nextItems = redensifyCategorySortOrder(nextItems, mutation.categoryId);
    }
  }

  return nextItems.sort(compareItemsBySortOrder);
};
