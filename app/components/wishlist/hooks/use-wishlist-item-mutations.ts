import { useMemo } from 'react';
import { useFetchers, useNavigation } from 'react-router';

import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import {
  isWishlistItemActive,
  type WishlistItemStatusValue,
} from '#app/utils/wishlist.ts';

import {
  applyPendingItemMutations,
  compareItemsBySortOrder,
  getFormString,
  normalizeFormActionPath,
  normalizeNullableFormValue,
  type PendingItemMutation,
  type WishlistItem,
} from '../wishlist-item-state';

function getImageState({
  existingItem,
  imageAction,
}: {
  existingItem: WishlistItem | null;
  imageAction: string;
}) {
  const hasImage =
    imageAction === 'remove'
      ? false
      : imageAction === 'upload' || imageAction === 'url'
        ? true
        : (existingItem?.hasImage ?? false);
  const imageSource: WishlistItemImageSource | null =
    imageAction === 'upload'
      ? 'MANUAL_UPLOAD'
      : imageAction === 'url'
        ? 'MANUAL_URL'
        : imageAction === 'remove'
          ? null
          : (existingItem?.imageSource ?? null);

  return { hasImage, imageSource };
}

function collectPendingUpsert({
  clientMutationId,
  formData,
  items,
}: {
  clientMutationId: string;
  formData: FormData;
  items: WishlistItem[];
}): PendingItemMutation[] {
  const intent = getFormString(formData, 'intent');
  if (intent !== 'save' && intent !== 'save-add-another') return [];

  const title = normalizeNullableFormValue(getFormString(formData, 'title'));
  if (!title) return [];

  const rawItemId = normalizeNullableFormValue(getFormString(formData, 'id'));
  const itemId = rawItemId ?? `optimistic-item:${clientMutationId}`;
  const existingItem = items.find((entry) => entry.id === rawItemId) ?? null;
  const categoryId =
    normalizeNullableFormValue(getFormString(formData, 'categoryId')) ?? null;
  const imageAction =
    normalizeNullableFormValue(getFormString(formData, 'imageAction')) ?? 'none';
  const { hasImage, imageSource } = getImageState({
    existingItem,
    imageAction,
  });

  return [
    {
      type: 'upsert',
      clientMutationId,
      itemId,
      title,
      note: normalizeNullableFormValue(getFormString(formData, 'note')),
      url: normalizeNullableFormValue(getFormString(formData, 'url')),
      itemType:
        normalizeNullableFormValue(getFormString(formData, 'type')) ??
        existingItem?.type ??
        'text',
      categoryId,
      hasImage,
      imageSource,
      status: (existingItem?.status ?? 'ACTIVE') as WishlistItemStatusValue,
      updatedAt: new Date(),
    },
  ];
}

function collectPendingDelete({
  actionPath,
  clientMutationId,
  formData,
}: {
  actionPath: string;
  clientMutationId: string;
  formData: FormData;
}): PendingItemMutation[] {
  const intent = getFormString(formData, 'intent');
  if (intent !== 'delete-wishlist-item') return [];

  const itemId =
    normalizeNullableFormValue(getFormString(formData, 'wishlistItemId')) ??
    actionPath.replace('/wishlist/', '');
  if (!itemId) return [];

  return [
    {
      type: 'delete',
      clientMutationId,
      itemId,
    },
  ];
}

function collectPendingMutations({
  fallbackMutationId,
  formAction,
  formData,
  items,
}: {
  fallbackMutationId: string;
  formAction: string | null | undefined;
  formData: FormData;
  items: WishlistItem[];
}) {
  const actionPath = normalizeFormActionPath(formAction);
  const clientMutationId =
    normalizeNullableFormValue(getFormString(formData, 'clientMutationId')) ??
    fallbackMutationId;

  if (actionPath === '/wishlist') {
    return collectPendingUpsert({
      clientMutationId,
      formData,
      items,
    });
  }

  if (actionPath?.startsWith('/wishlist/')) {
    return collectPendingDelete({
      actionPath,
      clientMutationId,
      formData,
    });
  }

  return [];
}

export const useWishlistItemMutations = ({
  items,
  userId,
}: {
  items: WishlistItem[];
  userId: string;
}) => {
  const pendingFetchers = useFetchers();
  const navigation = useNavigation();

  const pendingItemMutations = useMemo(() => {
    const fromFetchers = pendingFetchers.flatMap((fetcher, index) => {
      if (!fetcher.formData) return [];
      return collectPendingMutations({
        fallbackMutationId: `fetcher-item-${index}`,
        formAction: fetcher.formAction,
        formData: fetcher.formData,
        items,
      });
    });

    const fromNavigation =
      navigation.state !== 'idle' && navigation.formData
        ? collectPendingMutations({
            fallbackMutationId: 'navigation-item',
            formAction: navigation.formAction,
            formData: navigation.formData,
            items,
          })
        : [];

    return [...fromFetchers, ...fromNavigation];
  }, [
    items,
    navigation.formAction,
    navigation.formData,
    navigation.state,
    pendingFetchers,
  ]);

  const optimisticItems = useMemo(
    () =>
      applyPendingItemMutations({
        items,
        pendingMutations: pendingItemMutations,
        ownerId: userId,
      }),
    [items, pendingItemMutations, userId],
  );

  const activeItems = useMemo(
    () =>
      optimisticItems
        .filter((item) => isWishlistItemActive(item.status))
        .sort(compareItemsBySortOrder),
    [optimisticItems],
  );

  const archivedItems = useMemo(
    () => optimisticItems.filter((item) => !isWishlistItemActive(item.status)),
    [optimisticItems],
  );

  return { optimisticItems, activeItems, archivedItems };
};
