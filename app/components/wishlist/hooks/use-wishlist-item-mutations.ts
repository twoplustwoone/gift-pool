import { useMemo } from 'react';
import { useFetchers, useNavigation } from 'react-router';

import  { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import { isWishlistItemActive, type WishlistItemStatusValue  } from '#app/utils/wishlist.ts';


import {
  applyPendingItemMutations,
  compareItemsBySortOrder,
  getFormString,
  normalizeFormActionPath,
  normalizeNullableFormValue,
  type PendingItemMutation,
  type WishlistItem,
} from '../wishlist-item-state';

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
    const collectPending = (
      formData: FormData,
      formAction: string | null | undefined,
      fallbackMutationId: string,
    ): PendingItemMutation[] => {
      const actionPath = normalizeFormActionPath(formAction);
      const clientMutationId =
        normalizeNullableFormValue(
          getFormString(formData, 'clientMutationId'),
        ) ?? fallbackMutationId;

      if (actionPath === '/wishlist') {
        const intent = getFormString(formData, 'intent');
        if (intent !== 'save' && intent !== 'save-add-another') return [];

        const title = normalizeNullableFormValue(
          getFormString(formData, 'title'),
        );
        if (!title) return [];

        const rawItemId = normalizeNullableFormValue(
          getFormString(formData, 'id'),
        );
        const itemId = rawItemId ?? `optimistic-item:${clientMutationId}`;
        const existingItem =
          items.find((entry) => entry.id === rawItemId) ?? null;
        const categoryId =
          normalizeNullableFormValue(getFormString(formData, 'categoryId')) ??
          null;
        const imageAction =
          normalizeNullableFormValue(getFormString(formData, 'imageAction')) ??
          'none';
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

      if (actionPath?.startsWith('/wishlist/')) {
        const intent = getFormString(formData, 'intent');
        if (intent !== 'delete-wishlist-item') return [];
        const itemId =
          normalizeNullableFormValue(
            getFormString(formData, 'wishlistItemId'),
          ) ?? actionPath.replace('/wishlist/', '');
        if (!itemId) return [];
        return [
          {
            type: 'delete',
            clientMutationId,
            itemId,
          },
        ];
      }

      return [];
    };

    const fromFetchers = pendingFetchers.flatMap((fetcher, index) => {
      if (!fetcher.formData) return [];
      return collectPending(
        fetcher.formData,
        fetcher.formAction,
        `fetcher-item-${index}`,
      );
    });

    const fromNavigation =
      navigation.state !== 'idle' && navigation.formData
        ? collectPending(
            navigation.formData,
            navigation.formAction,
            'navigation-item',
          )
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
