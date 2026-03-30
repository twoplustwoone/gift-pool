import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useFetcher } from 'react-router';
import { toast } from 'sonner';

import { createClientMutationId } from '#app/utils/client-mutation-id.ts';

import { type WishlistCategory } from '../wishlist-category-state';
import {
  applyCategoryItemOrder,
  CATEGORY_DRAG_PREFIX,
  categoryIdFromKey,
  categoryKeyFromId,
  cloneCategoriesSnapshot,
  cloneItemsSnapshot,
  getCategoryIdFromDragId,
  getCategoryKeyFromDropId,
  getItemIdFromDragId,
  ITEM_DRAG_PREFIX,
  moveItemIdBetweenLists,
  type PendingReorderMutation,
  reorderItemIdsInList,
  toCategoryDragId,
  toCategoryDropId,
  toItemDragId,
  type WishlistItem,
} from '../wishlist-item-state';

type ReorderMode = 'off' | 'items' | 'categories';

type WishlistReorderMutationResponse = {
  ok: boolean;
  error?: string;
  clientMutationId?: string | null;
};

function buildNextCategories(
  orderedCategories: WishlistCategory[],
  nextCategoryIds: string[],
) {
  return nextCategoryIds
    .map((id, order) => {
      const category = orderedCategories.find((entry) => entry.id === id);
      if (!category) return null;
      return { ...category, order };
    })
    .filter(Boolean) as WishlistCategory[];
}

export const useWishlistReorder = ({
  items,
  setItems,
  orderedCategories,
  setOrderedCategories,
  activeItems: _activeItems,
  itemIdsByCategoryKey,
  itemById,
  isOwner,
  isPublicView,
  view,
}: {
  items: WishlistItem[];
  setItems: Dispatch<SetStateAction<WishlistItem[]>>;
  orderedCategories: WishlistCategory[];
  setOrderedCategories: Dispatch<SetStateAction<WishlistCategory[]>>;
  activeItems: WishlistItem[];
  itemIdsByCategoryKey: Record<string, string[]>;
  itemById: Map<string, WishlistItem>;
  isOwner: boolean;
  isPublicView: boolean;
  view: 'wishlist' | 'past';
}) => {
  const reorderFetcher = useFetcher<WishlistReorderMutationResponse>();
  const [reorderMode, setReorderMode] = useState<ReorderMode>('off');
  const [dragging, setDragging] = useState<{
    type: 'category' | 'item';
    dragId: string;
  } | null>(null);
  const [itemDropTargetCategoryKey, setItemDropTargetCategoryKey] = useState<
    string | null
  >(null);
  const pendingReorderMutationRef = useRef<PendingReorderMutation | null>(null);

  const canReorder = isOwner && view === 'wishlist' && !isPublicView;
  const isReorderMode = canReorder && reorderMode !== 'off';
  const isItemReorderMode = isReorderMode && reorderMode === 'items';
  const isCategoryReorderMode = isReorderMode && reorderMode === 'categories';

  const resetReorderState = () => {
    setDragging(null);
    setItemDropTargetCategoryKey(null);
  };

  const startItemReorderMode = () => {
    if (!canReorder) return;
    resetReorderState();
    setReorderMode('items');
  };

  const startCategoryReorderMode = () => {
    if (!canReorder) return;
    resetReorderState();
    setReorderMode('categories');
  };

  const finishReorderMode = () => {
    resetReorderState();
    setReorderMode('off');
  };

  useEffect(() => {
    if (canReorder) return;
    setDragging(null);
    setItemDropTargetCategoryKey(null);
    setReorderMode('off');
  }, [canReorder]);

  // Handle reorder fetcher response
  useEffect(() => {
    if (reorderFetcher.state !== 'idle') {
      return;
    }

    const pendingMutation = pendingReorderMutationRef.current;
    if (!pendingMutation) return;

    const actionData = reorderFetcher.data;
    if (
      actionData?.clientMutationId &&
      actionData.clientMutationId !== pendingMutation.clientMutationId
    ) {
      return;
    }
    pendingReorderMutationRef.current = null;

    if (!actionData?.ok) {
      toast.error('Unable to save reorder', {
        description: actionData?.error ?? 'The list changed. Please try again.',
      });
      setItems(pendingMutation.previousItems);
      setOrderedCategories(pendingMutation.previousCategories);
    }
  }, [reorderFetcher.data, reorderFetcher.state, setItems, setOrderedCategories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const submitCategoryReorder = ({
    ids,
    previousItems,
    previousCategories,
  }: {
    ids: string[];
    previousItems: WishlistItem[];
    previousCategories: WishlistCategory[];
  }) => {
    const clientMutationId = createClientMutationId();
    pendingReorderMutationRef.current = {
      clientMutationId,
      previousItems: cloneItemsSnapshot(previousItems),
      previousCategories: cloneCategoriesSnapshot(previousCategories),
    };
    const formData = new FormData();
    formData.set('intent', 'reorder-categories');
    formData.set('orderedCategoryIds', JSON.stringify(ids));
    formData.set('clientMutationId', clientMutationId);
    Promise.resolve(
      reorderFetcher.submit(formData, {
        method: 'post',
        action: '/wishlist/reorder',
      }),
    ).catch(() => {});
  };

  const submitItemReorder = ({
    sourceCategoryId,
    targetCategoryId,
    sourceOrderedItemIds,
    targetOrderedItemIds,
    previousItems,
    previousCategories,
  }: {
    sourceCategoryId: string | null;
    targetCategoryId: string | null;
    sourceOrderedItemIds: string[];
    targetOrderedItemIds?: string[];
    previousItems: WishlistItem[];
    previousCategories: WishlistCategory[];
  }) => {
    const clientMutationId = createClientMutationId();
    pendingReorderMutationRef.current = {
      clientMutationId,
      previousItems: cloneItemsSnapshot(previousItems),
      previousCategories: cloneCategoriesSnapshot(previousCategories),
    };
    const formData = new FormData();
    formData.set('intent', 'reorder-items');
    formData.set('sourceCategoryId', sourceCategoryId ?? '');
    formData.set('targetCategoryId', targetCategoryId ?? '');
    formData.set('sourceOrderedItemIds', JSON.stringify(sourceOrderedItemIds));
    formData.set('clientMutationId', clientMutationId);
    if (targetOrderedItemIds) {
      formData.set(
        'targetOrderedItemIds',
        JSON.stringify(targetOrderedItemIds),
      );
    }
    Promise.resolve(
      reorderFetcher.submit(formData, {
        method: 'post',
        action: '/wishlist/reorder',
      }),
    ).catch(() => {});
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const dragId = String(active.id);
    if (!isReorderMode) return;

    if (
      reorderMode === 'categories' &&
      dragId.startsWith(CATEGORY_DRAG_PREFIX)
    ) {
      setDragging({ type: 'category', dragId });
      return;
    }

    if (reorderMode === 'items' && dragId.startsWith(ITEM_DRAG_PREFIX)) {
      setDragging({ type: 'item', dragId });
    }
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    if (reorderMode !== 'items') return;
    if (dragging?.type !== 'item') return;
    if (!over) {
      setItemDropTargetCategoryKey(null);
      return;
    }

    const overId = String(over.id);
    const overCategoryKeyFromDrop = getCategoryKeyFromDropId(overId);
    if (overCategoryKeyFromDrop) {
      setItemDropTargetCategoryKey(overCategoryKeyFromDrop);
      return;
    }

    const overItemId = getItemIdFromDragId(overId);
    if (!overItemId) {
      setItemDropTargetCategoryKey(null);
      return;
    }

    const overItem = itemById.get(overItemId);
    setItemDropTargetCategoryKey(
      categoryKeyFromId(overItem?.categoryId ?? null),
    );
  };

  const handleDragCancel = () => {
    resetReorderState();
  };

  const customCategoryIds = orderedCategories.map((category) => category.id);
  const finishCategoryDrag = (activeDragId: string, overDragId: string) => {
    const activeCategoryId = getCategoryIdFromDragId(activeDragId);
    const overCategoryId = getCategoryIdFromDragId(overDragId);
    if (
      !activeCategoryId ||
      !overCategoryId ||
      activeCategoryId === overCategoryId
    ) {
      return false;
    }

    const oldIndex = customCategoryIds.indexOf(activeCategoryId);
    const newIndex = customCategoryIds.indexOf(overCategoryId);
    if (oldIndex === -1 || newIndex === -1) {
      return false;
    }

    const nextCategoryIds = arrayMove(customCategoryIds, oldIndex, newIndex);
    const previousItems = items;
    const previousCategories = orderedCategories;

    setOrderedCategories(buildNextCategories(orderedCategories, nextCategoryIds));
    submitCategoryReorder({
      ids: nextCategoryIds,
      previousItems,
      previousCategories,
    });
    return true;
  };
  const finishItemDrag = (activeDragId: string, overDragId: string) => {
    const movedItemId = getItemIdFromDragId(activeDragId);
    if (!movedItemId) return false;

    const movedItem = itemById.get(movedItemId);
    if (!movedItem) return false;

    const sourceCategoryId = movedItem.categoryId ?? null;
    const sourceCategoryKey = categoryKeyFromId(sourceCategoryId);
    const sourceIds = itemIdsByCategoryKey[sourceCategoryKey] ?? [];

    const overCategoryKeyFromDrop = getCategoryKeyFromDropId(overDragId);
    const overItemId = getItemIdFromDragId(overDragId);
    const overItem = overItemId ? itemById.get(overItemId) : null;
    const targetCategoryId = overCategoryKeyFromDrop
      ? categoryIdFromKey(overCategoryKeyFromDrop)
      : (overItem?.categoryId ?? null);
    const targetCategoryKey = categoryKeyFromId(targetCategoryId);
    if (!targetCategoryKey) return false;

    const targetIds = itemIdsByCategoryKey[targetCategoryKey] ?? [];
    if (sourceCategoryId === targetCategoryId) {
      const nextSourceIds = overItemId
        ? reorderItemIdsInList({
            orderedIds: sourceIds,
            activeId: movedItemId,
            overId: overItemId,
          })
        : sourceIds;

      if (nextSourceIds.join('|') !== sourceIds.join('|')) {
        const previousItems = items;
        const previousCategories = orderedCategories;
        setItems((prev) =>
          applyCategoryItemOrder({
            prevItems: prev,
            categoryId: sourceCategoryId,
            orderedIds: nextSourceIds,
          }),
        );
        submitItemReorder({
          sourceCategoryId,
          targetCategoryId,
          sourceOrderedItemIds: nextSourceIds,
          previousItems,
          previousCategories,
        });
      }

      return true;
    }

    const targetIndex = overItemId
      ? Math.max(0, targetIds.indexOf(overItemId))
      : targetIds.length;
    const { sourceIds: nextSourceIds, targetIds: nextTargetIds } =
      moveItemIdBetweenLists({
        sourceIds,
        targetIds,
        movedId: movedItemId,
        targetIndex,
      });

    const previousItems = items;
    const previousCategories = orderedCategories;
    setItems((prev) => {
      const sourceUpdated = applyCategoryItemOrder({
        prevItems: prev,
        categoryId: sourceCategoryId,
        orderedIds: nextSourceIds,
      });
      return applyCategoryItemOrder({
        prevItems: sourceUpdated,
        categoryId: targetCategoryId,
        orderedIds: nextTargetIds,
      });
    });

    submitItemReorder({
      sourceCategoryId,
      targetCategoryId,
      sourceOrderedItemIds: nextSourceIds,
      targetOrderedItemIds: nextTargetIds,
      previousItems,
      previousCategories,
    });
    return true;
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeDragId = String(active.id);
    const overDragId = over ? String(over.id) : null;

    if (!overDragId) {
      handleDragCancel();
      return;
    }

    if (reorderMode === 'categories' && dragging?.type === 'category') {
      finishCategoryDrag(activeDragId, overDragId);
      handleDragCancel();
      return;
    }

    if (reorderMode !== 'items' || dragging?.type !== 'item') {
      handleDragCancel();
      return;
    }

    finishItemDrag(activeDragId, overDragId);
    handleDragCancel();
  };

  const dragState: 'idle' | 'dragging-item' | 'dragging-category' =
    dragging?.type === 'category'
      ? 'dragging-category'
      : dragging?.type === 'item'
        ? 'dragging-item'
        : 'idle';

  return {
    reorderMode,
    dragging,
    itemDropTargetCategoryKey,
    dragState,
    isItemReorderMode,
    isCategoryReorderMode,
    canReorder,
    sensors,
    startItemReorderMode,
    startCategoryReorderMode,
    finishReorderMode,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    // Re-export for use in wishlist.tsx drag id helpers
    toCategoryDragId,
    toItemDragId,
    toCategoryDropId,
  };
};
