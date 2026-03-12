import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  type UserImage,
  type User,
} from '@prisma/client';
import {
  type FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFetcher, useSearchParams } from 'react-router';

import { useToast } from '#app/components/toaster.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog';
import {
  WishlistItemEditor,
  type WishlistItemEditorHandle,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';

import { Button } from '../ui/button.tsx';
import { Flex, Stack, Text } from '../ui-kit';
import { useWishlistCategoryMutations } from './hooks/use-wishlist-category-mutations';
import { useWishlistItemMutations } from './hooks/use-wishlist-item-mutations';
import { useWishlistReorder } from './hooks/use-wishlist-reorder';
import { useWishlistStatusUpdate } from './hooks/use-wishlist-status-update';
import { PastEducationCallout, PastWishlistItems } from './past-wishlist-items';
import {
  SortableShell,
  WishlistCategoryCard,
} from './wishlist-category-card';
import  { type WishlistCategory } from './wishlist-category-state';
import { WishlistHeader } from './wishlist-header';
import {
  categoryKeyFromId,
  DEFAULT_CATEGORY_KEY,
  toCategoryDragId,
  type WishlistItem,
} from './wishlist-item-state';

export type WishlistUser = Pick<User, 'id' | 'username' | 'name'> & {
  image: Pick<UserImage, 'id'> | null;
  wishlistItems: WishlistItem[];
  wishlistCategories: WishlistCategory[];
};

type WishlistPublicShare = { token: string; createdAt: Date };

export const Wishlist = ({
  user,
  isOwner,
  origin,
  publicShare,
  isPublicView = false,
}: {
  user: WishlistUser;
  isOwner: boolean;
  origin?: string;
  publicShare?: WishlistPublicShare | null;
  isPublicView?: boolean;
}) => {
  const displayName = user.name ?? user.username;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView =
    searchParams.get('view') === 'past'
      ? ('past' as const)
      : ('wishlist' as const);
  const [view, setView] = useState<'wishlist' | 'past'>(initialView);

  const handleViewChange = useCallback(
    (next: 'wishlist' | 'past') => {
      const params = new URLSearchParams(searchParams);
      if (next === 'past') {
        params.set('view', 'past');
      } else {
        params.delete('view');
      }
      setSearchParams(params, { replace: true });
      setView(next);
    },
    [searchParams, setSearchParams],
  );

  // Sync view from searchParams
  useEffect(() => {
    const paramsView =
      searchParams.get('view') === 'past'
        ? ('past' as const)
        : ('wishlist' as const);
    setView(paramsView);
  }, [searchParams]);

  // orderedCategories lives here — written by both category mutations hook and reorder hook
  const [orderedCategories, setOrderedCategories] = useState(() =>
    [...user.wishlistCategories].sort((a, b) => a.order - b.order),
  );

  // Category card UI state
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<string | null>(
    null,
  );
  const quickAddEditorRef = useRef<WishlistItemEditorHandle>(null);

  // actionFetcher shared by rename form and delete dialog
  const actionFetcher = useFetcher();
  const handledRef = useRef(false);
  useEffect(() => {
    const ok = (actionFetcher.data as any)?.ok;
    if (actionFetcher.state === 'idle' && ok && !handledRef.current) {
      handledRef.current = true;
      setEditingId(null);
    }
    if (actionFetcher.state !== 'idle') {
      handledRef.current = false;
    }
  }, [actionFetcher.state, actionFetcher.data]);

  useToast((actionFetcher.data as any)?.toast);

  const attachClientMutationIdToForm = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const formElement = event.currentTarget;
      const mutationId = createClientMutationId();
      const existingInput = formElement.elements.namedItem(
        'clientMutationId',
      ) as HTMLInputElement | null;

      if (existingInput) {
        existingInput.value = mutationId;
        return;
      }

      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.name = 'clientMutationId';
      hiddenInput.value = mutationId;
      formElement.append(hiddenInput);
    },
    [],
  );

  // --- Hooks ---

  const { items, setItems, showEducation, markEducationSeen, handleStatusChange } =
    useWishlistStatusUpdate({
      serverItems: user.wishlistItems,
      userId: user.id,
      onViewChange: handleViewChange,
    });

  const { optimisticCategories, handleCategoryMutationResult } =
    useWishlistCategoryMutations({
      orderedCategories,
      setOrderedCategories,
      serverCategories: user.wishlistCategories,
    });

  const { activeItems, archivedItems } =
    useWishlistItemMutations({
      items,
      userId: user.id,
    });

  // --- Derived values ---

  const hasDefaultItems = activeItems.some((item) => item.categoryId === null);
  const categories = [
    { id: null, name: 'Default (Uncategorized)', order: -1 },
    ...optimisticCategories,
  ].filter((category) => {
    if (category.id !== null) return true;
    if (isOwner) return true;
    return hasDefaultItems;
  });

  const customCategoryIds = orderedCategories.map((category) => category.id);

  const itemIdsByCategoryKey = useMemo(() => {
    return categories.reduce<Record<string, string[]>>((acc, category) => {
      const categoryKey = categoryKeyFromId(category.id);
      acc[categoryKey] = activeItems
        .filter((item) => item.categoryId === category.id)
        .map((item) => item.id);
      return acc;
    }, {});
  }, [activeItems, categories]);

  const itemById = useMemo(
    () => new Map(activeItems.map((item) => [item.id, item])),
    [activeItems],
  );

  const {
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
  } = useWishlistReorder({
    items,
    setItems,
    orderedCategories,
    setOrderedCategories,
    activeItems,
    itemIdsByCategoryKey,
    itemById,
    isOwner,
    isPublicView,
    view,
  });

  const isReorderMode = canReorder && reorderMode !== 'off';

  const activeItemId =
    dragging?.type === 'item'
      ? dragging.dragId.replace(/^item:/, '')
      : null;
  const activeItemCategoryKey = activeItemId
    ? categoryKeyFromId(itemById.get(activeItemId)?.categoryId ?? null)
    : null;

  const toggle = (id: string | null) => {
    setCollapsed((prev) => ({
      ...prev,
      [id ?? 'default']: !prev[id ?? 'default'],
    }));
  };

  const openQuickAdd = (categoryId: string | null) => {
    setQuickAddCategoryId(categoryId);
    requestAnimationFrame(() => {
      quickAddEditorRef.current?.openCreate();
    });
  };

  const defaultCategory =
    categories.find((category) => category.id === null) ?? null;
  const customCategories = categories.filter(
    (category): category is { id: string; name: string; order: number } =>
      category.id !== null,
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-clip">
      {isOwner ? (
        <WishlistItemEditor
          key={`quick-add-${quickAddCategoryId ?? 'default'}`}
          ref={quickAddEditorRef}
          categories={optimisticCategories}
          defaultCategoryId={quickAddCategoryId}
          onStatusChange={handleStatusChange}
          showDefaultTrigger={false}
          hideFloatingTrigger
        />
      ) : null}
      <WishlistHeader
        isOwner={isOwner}
        user={{ ...user, wishlistCategories: optimisticCategories }}
        displayName={displayName}
        origin={origin}
        publicShare={publicShare ?? null}
        isPublicView={isPublicView}
        hideOwnerControls={isReorderMode}
        hideFloatingAddButton={isReorderMode}
        onStartItemReorder={startItemReorderMode}
        onStartCategoryReorder={startCategoryReorderMode}
        onCategoryMutationResult={handleCategoryMutationResult}
      />
      <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 px-3 py-8 sm:px-6">
        <Stack gap={4}>
          <div className="inline-flex w-full max-w-md rounded-full bg-muted p-1 text-sm">
            <button
              type="button"
              className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${view === 'wishlist'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
                }`}
              aria-pressed={view === 'wishlist'}
              onClick={() => handleViewChange('wishlist')}
            >
              Wishlist
            </button>
            <button
              type="button"
              className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${view === 'past'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
                }`}
              aria-pressed={view === 'past'}
              onClick={() => handleViewChange('past')}
            >
              Past items
            </button>
          </div>

          {showEducation && view === 'wishlist' ? (
            <PastEducationCallout
              onDismissEducation={markEducationSeen}
              onViewPast={() => {
                handleViewChange('past');
              }}
            />
          ) : null}

          {isReorderMode ? (
            <div className="sticky top-2 z-20 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Text size="sm" weight="bold" className="text-emerald-900">
                    Reorder mode
                  </Text>
                  <Text size="xs" className="text-emerald-800">
                    Drag handles to move{' '}
                    {isCategoryReorderMode ? 'categories' : 'items'}.
                  </Text>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-full border border-emerald-200 bg-background/80 p-1 text-xs">
                    <button
                      type="button"
                      aria-label="Item reorder mode"
                      className={`rounded-full px-3 py-1.5 font-semibold transition ${isItemReorderMode
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-emerald-900 hover:bg-emerald-100'
                        }`}
                      onClick={startItemReorderMode}
                    >
                      Items
                    </button>
                    <button
                      type="button"
                      aria-label="Category reorder mode"
                      className={`rounded-full px-3 py-1.5 font-semibold transition ${isCategoryReorderMode
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-emerald-900 hover:bg-emerald-100'
                        }`}
                      onClick={startCategoryReorderMode}
                    >
                      Categories
                    </button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label="Done reordering"
                    className="border border-emerald-200 bg-white/90 hover:bg-white"
                    onClick={finishReorderMode}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {view === 'wishlist' ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              autoScroll={isReorderMode}
              onDragStart={isReorderMode ? handleDragStart : undefined}
              onDragOver={isReorderMode ? handleDragOver : undefined}
              onDragEnd={isReorderMode ? handleDragEnd : undefined}
              onDragCancel={isReorderMode ? handleDragCancel : undefined}
            >
              <div
                className={`space-y-4 ${isOwner && !isReorderMode
                    ? 'pb-[calc(theme(spacing.24)+env(safe-area-inset-bottom))] sm:pb-0'
                    : 'pb-2'
                  }`}
              >
                {isCategoryReorderMode ? (
                  <div className="space-y-3">
                    {defaultCategory ? (
                      <div
                        className="rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-sm"
                        data-testid="wishlist-category-row"
                        data-drag-state={dragState}
                        data-drop-target="false"
                      >
                        <div className="flex min-h-10 items-center justify-between gap-3">
                          <Text weight="bold">{defaultCategory.name}</Text>
                          <Text size="xs" className="text-muted-foreground">
                            (
                            {itemIdsByCategoryKey[DEFAULT_CATEGORY_KEY]
                              ?.length ?? 0}
                            )
                          </Text>
                        </div>
                      </div>
                    ) : null}
                    <SortableContext
                      items={customCategoryIds.map((categoryId) =>
                        toCategoryDragId(categoryId),
                      )}
                      strategy={rectSortingStrategy}
                    >
                      {customCategories.map((category) => (
                        <SortableShell
                          key={category.id}
                          id={toCategoryDragId(category.id)}
                        >
                          {({
                            attributes,
                            listeners,
                            setActivatorNodeRef,
                            isDragging,
                          }) => (
                            <div
                              className={`rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-sm transition ${isDragging
                                  ? 'border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-300'
                                  : ''
                                }`}
                              data-testid="wishlist-category-row"
                              data-drag-state={dragState}
                              data-drop-target="false"
                            >
                              <div className="flex min-h-10 items-center gap-3">
                                <button
                                  type="button"
                                  ref={setActivatorNodeRef}
                                  aria-label={`Drag category ${category.name}`}
                                  className="inline-flex h-10 w-10 touch-none items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) =>
                                    event.stopPropagation()
                                  }
                                  {...attributes}
                                  {...listeners}
                                >
                                  <svg
                                    className="h-4 w-4"
                                    aria-hidden
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <line x1="8" y1="6" x2="21" y2="6" />
                                    <line x1="8" y1="12" x2="21" y2="12" />
                                    <line x1="8" y1="18" x2="21" y2="18" />
                                    <line x1="3" y1="6" x2="3.01" y2="6" />
                                    <line x1="3" y1="12" x2="3.01" y2="12" />
                                    <line x1="3" y1="18" x2="3.01" y2="18" />
                                  </svg>
                                </button>
                                <div className="min-w-0 flex-1">
                                  <Flex align="center" gap={2}>
                                    <Text weight="bold" className="truncate">
                                      {category.name}
                                    </Text>
                                    <Text
                                      size="xs"
                                      className="text-muted-foreground"
                                    >
                                      (
                                      {itemIdsByCategoryKey[category.id]
                                        ?.length ?? 0}
                                      )
                                    </Text>
                                  </Flex>
                                </div>
                              </div>
                            </div>
                          )}
                        </SortableShell>
                      ))}
                    </SortableContext>
                  </div>
                ) : (
                  <>
                    {defaultCategory ? (
                      <WishlistCategoryCard
                        category={defaultCategory}
                        isOwner={isOwner}
                        isPublicView={isPublicView}
                        canReorder={canReorder}
                        isItemReorderMode={isItemReorderMode}
                        isCategoryReorderMode={isCategoryReorderMode}
                        isCollapsed={
                          isItemReorderMode
                            ? false
                            : Boolean(collapsed[DEFAULT_CATEGORY_KEY])
                        }
                        isEditing={false}
                        isCategoryDropHighlighted={
                          isItemReorderMode &&
                          itemDropTargetCategoryKey === DEFAULT_CATEGORY_KEY &&
                          activeItemCategoryKey !== DEFAULT_CATEGORY_KEY
                        }
                        dragState={dragState}
                        itemsForCategory={(
                          itemIdsByCategoryKey[DEFAULT_CATEGORY_KEY] ?? []
                        )
                          .map((id) => itemById.get(id))
                          .filter(Boolean) as WishlistItem[]}
                        itemIds={itemIdsByCategoryKey[DEFAULT_CATEGORY_KEY] ?? []}
                        optimisticCategories={optimisticCategories}
                        actionFetcher={actionFetcher}
                        onToggleCollapse={() => toggle(null)}
                        onSetEditing={setEditingId}
                        onRequestDelete={setPendingDeleteCategory}
                        onOpenQuickAdd={openQuickAdd}
                        onStartItemReorder={startItemReorderMode}
                        onStartCategoryReorder={startCategoryReorderMode}
                        onStatusChange={handleStatusChange}
                        onAttachClientMutationId={attachClientMutationIdToForm}
                      />
                    ) : null}
                    <div className="space-y-4">
                      {customCategories.map((category) => (
                        <Fragment key={category.id}>
                          <WishlistCategoryCard
                            category={category}
                            isOwner={isOwner}
                            isPublicView={isPublicView}
                            canReorder={canReorder}
                            isItemReorderMode={isItemReorderMode}
                            isCategoryReorderMode={isCategoryReorderMode}
                            isCollapsed={
                              isItemReorderMode
                                ? false
                                : Boolean(collapsed[category.id])
                            }
                            isEditing={
                              category.id !== null &&
                              editingId === category.id &&
                              !isCategoryReorderMode &&
                              !isItemReorderMode
                            }
                            isCategoryDropHighlighted={
                              isItemReorderMode &&
                              itemDropTargetCategoryKey === category.id &&
                              activeItemCategoryKey !== category.id
                            }
                            dragState={dragState}
                            itemsForCategory={(
                              itemIdsByCategoryKey[category.id] ?? []
                            )
                              .map((id) => itemById.get(id))
                              .filter(Boolean) as WishlistItem[]}
                            itemIds={itemIdsByCategoryKey[category.id] ?? []}
                            optimisticCategories={optimisticCategories}
                            actionFetcher={actionFetcher}
                            onToggleCollapse={() => toggle(category.id)}
                            onSetEditing={setEditingId}
                            onRequestDelete={setPendingDeleteCategory}
                            onOpenQuickAdd={openQuickAdd}
                            onStartItemReorder={startItemReorderMode}
                            onStartCategoryReorder={startCategoryReorderMode}
                            onStatusChange={handleStatusChange}
                            onAttachClientMutationId={
                              attachClientMutationIdToForm
                            }
                          />
                        </Fragment>
                      ))}
                    </div>
                  </>
                )}

                {activeItems.length === 0 ? (
                  <div className="flex w-full flex-col items-center justify-center">
                    {isOwner ? (
                      <p className="text-center text-base text-slate-500">
                        Looks like you don't have any items in your wishlist
                        yet!
                        {archivedItems.length
                          ? ' Past items are available in the Past items tab.'
                          : ''}
                      </p>
                    ) : (
                      <p className="text-center text-base text-slate-500">
                        {displayName} doesn't have any active items in their
                        wishlist right now!
                        {archivedItems.length
                          ? ' Their past items are available in the Past items tab.'
                          : ''}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </DndContext>
          ) : (
            <PastWishlistItems
              items={archivedItems}
              isOwner={isOwner}
              categories={optimisticCategories}
              showEducation={showEducation}
              onDismissEducation={markEducationSeen}
              onViewPast={() => {
                markEducationSeen();
                handleViewChange('past');
              }}
              onStatusChange={handleStatusChange}
            />
          )}
        </Stack>
      </div>
      <Dialog
        open={pendingDeleteCategory !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteCategory(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
            <DialogDescription>
              {pendingDeleteCategory
                ? `Delete ${pendingDeleteCategory.name}? Items in this category will move to Default (Uncategorized).`
                : 'Delete this category? Items in this category will move to Default (Uncategorized).'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingDeleteCategory(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !pendingDeleteCategory || actionFetcher.state !== 'idle'
              }
              onClick={() => {
                if (!pendingDeleteCategory) return;
                void actionFetcher.submit(
                  {
                    intent: 'delete',
                    id: pendingDeleteCategory.id,
                    clientMutationId: createClientMutationId(),
                  },
                  {
                    method: 'post',
                    action: '/wishlist/categories',
                  },
                );
                setPendingDeleteCategory(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
