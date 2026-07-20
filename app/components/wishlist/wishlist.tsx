import { DndContext, closestCenter } from '@dnd-kit/core';
import { type UserImage, type User } from '@prisma/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LuPlus } from 'react-icons/lu';
import { useFetcher, useSearchParams } from 'react-router';

import { useToast } from '#app/components/toaster.tsx';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#app/components/ui/responsive-dialog';
import {
  WishlistItemEditor,
  type WishlistItemEditorHandle,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';

import { Button } from '../ui/button.tsx';
import { Stack, Text } from '../ui-kit';
import { useWishlistCategoryMutations } from './hooks/use-wishlist-category-mutations';
import { useWishlistItemMutations } from './hooks/use-wishlist-item-mutations';
import { useWishlistReorder } from './hooks/use-wishlist-reorder';
import { useWishlistStatusUpdate } from './hooks/use-wishlist-status-update';
import { PastEducationCallout, PastWishlistItems } from './past-wishlist-items';
import {
  CategoryItemsGrid,
  CategoryReorderBody,
  WishlistCategoryCard,
  type MoveTargetCategory,
} from './wishlist-category-card';
import { type CategoryMutationResult, type WishlistCategory } from './wishlist-category-state';
import { WishlistHeader } from './wishlist-header';
import {
  categoryKeyFromId,
  DEFAULT_CATEGORY_KEY,
  type WishlistItem,
} from './wishlist-item-state';
import { WishlistNote } from './wishlist-note';
import { OrganizeBanner, OrganizeCategoriesPanel } from './wishlist-organize';

export type WishlistUser = Pick<User, 'id' | 'username' | 'name'> & {
  image: Pick<UserImage, 'id'> | null;
  wishlistItems: WishlistItem[];
  wishlistCategories: WishlistCategory[];
  wishlistNote?: string | null;
};

type WishlistPublicShare = { token: string; createdAt: Date };
type WishlistView = 'wishlist' | 'past';
type WishlistViewToggleProps = Readonly<{
  onChange: (view: WishlistView) => void;
  view: WishlistView;
}>;
type WishlistEmptyStateProps = Readonly<{
  archivedItemsCount: number;
  displayName: string;
  isOwner: boolean;
  onAddFirstItem: () => void;
}>;
type DeleteCategoryDialogProps = Readonly<{
  actionFetcherState: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  pendingDeleteCategory: { id: string; name: string } | null;
}>;
type WishlistProps = Readonly<{
  user: WishlistUser;
  isOwner: boolean;
  origin?: string;
  publicShare?: WishlistPublicShare | null;
  isPublicView?: boolean;
}>;
type WishlistActiveViewProps = Readonly<{
  activeItemCategoryKey: string | null;
  activeItems: WishlistItem[];
  archivedItems: WishlistItem[];
  canReorder: boolean;
  collapsed: Record<string, boolean>;
  customCategories: WishlistCategory[];
  defaultCategory: { id: null; name: string; order: number } | null;
  displayName: string;
  dragState: ReturnType<typeof useWishlistReorder>['dragState'];
  handleStatusChange: (itemId: string, status: any) => boolean | void;
  isCategoryReorderMode: boolean;
  isItemReorderMode: boolean;
  isOwner: boolean;
  isPublicView: boolean;
  itemById: Map<string, WishlistItem>;
  itemDropTargetCategoryKey: string | null;
  itemIdsByCategoryKey: Record<string, string[]>;
  moveTargets: MoveTargetCategory[];
  onAddFirstItem: () => void;
  onCategoryMutationResult: (result: CategoryMutationResult) => void;
  onMoveCategoryByOffset: (categoryId: string, delta: -1 | 1) => void;
  onMoveItemByOffset: (itemId: string, delta: -1 | 1) => void;
  onMoveItemToCategory: (itemId: string, categoryId: string | null) => void;
  onOpenQuickAdd: (categoryId: string | null) => void;
  onRequestDelete: (category: { id: string; name: string }) => void;
  onToggleCollapse: (id: string | null) => void;
  optimisticCategories: WishlistCategory[];
}>;

function isWishlistItem(
  value: WishlistItem | undefined,
): value is WishlistItem {
  return Boolean(value);
}

const DEFAULT_CATEGORY_NAME = 'Default (Uncategorized)';

// Item-first composition: with no custom categories the wishlist is a flat
// item list and no category chrome renders at all. Category sections appear
// only once the owner has actually created categories; the Default section
// then shows only when it holds items.
function buildWishlistCategories(
  activeItems: WishlistItem[],
  optimisticCategories: WishlistCategory[],
) {
  if (optimisticCategories.length === 0) return [];

  const hasDefaultItems = activeItems.some((item) => item.categoryId === null);
  return [
    { id: null, name: DEFAULT_CATEGORY_NAME, order: -1 },
    ...optimisticCategories,
  ].filter((category) => category.id !== null || hasDefaultItems);
}

// Quiet, earned control: only rendered once past items exist (or the user is
// already on the past view). Past items are secondary memory, not a co-equal
// destination.
function WishlistViewToggle({ onChange, view }: WishlistViewToggleProps) {
  return (
    <div className="inline-flex self-start rounded-full bg-muted p-1 text-sm">
      <button
        type="button"
        className={`rounded-full px-4 py-1.5 font-semibold transition ${
          view === 'wishlist'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={view === 'wishlist'}
        onClick={() => onChange('wishlist')}
      >
        Wishlist
      </button>
      <button
        type="button"
        className={`rounded-full px-4 py-1.5 font-semibold transition ${
          view === 'past'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-pressed={view === 'past'}
        onClick={() => onChange('past')}
      >
        Past items
      </button>
    </div>
  );
}

function WishlistEmptyState({
  archivedItemsCount,
  displayName,
  isOwner,
  onAddFirstItem,
}: WishlistEmptyStateProps) {
  if (isOwner) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
        <div className="flex flex-col gap-1">
          <Text weight="bold">Your wishlist starts here</Text>
          <Text size="sm" className="text-muted-foreground">
            Add something you'd love — friends and family use it to pick
            gifts you actually want.
            {archivedItemsCount
              ? ' Your past items are saved in the Past items view.'
              : ''}
          </Text>
        </div>
        <Button type="button" onClick={onAddFirstItem}>
          <LuPlus className="h-4 w-4" aria-hidden />
          Add your first item
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <p className="text-center text-base text-muted-foreground">
        {displayName} doesn't have any active items in their wishlist right
        now!
        {archivedItemsCount
          ? ' Their past items are available in the Past items view.'
          : ''}
      </p>
    </div>
  );
}

function DeleteCategoryDialog({
  actionFetcherState,
  onConfirm,
  onOpenChange,
  pendingDeleteCategory,
}: DeleteCategoryDialogProps) {
  return (
    <Dialog open={pendingDeleteCategory !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete category</DialogTitle>
          <DialogDescription>
            {pendingDeleteCategory
              ? `Delete ${pendingDeleteCategory.name}? Items in this category will move to ${DEFAULT_CATEGORY_NAME}.`
              : `Delete this category? Items in this category will move to ${DEFAULT_CATEGORY_NAME}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!pendingDeleteCategory || actionFetcherState !== 'idle'}
            onClick={onConfirm}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WishlistActiveView({
  activeItemCategoryKey,
  activeItems,
  archivedItems,
  canReorder,
  collapsed,
  customCategories,
  defaultCategory,
  displayName,
  dragState,
  handleStatusChange,
  isCategoryReorderMode,
  isItemReorderMode,
  isOwner,
  isPublicView,
  itemById,
  itemDropTargetCategoryKey,
  itemIdsByCategoryKey,
  moveTargets,
  onAddFirstItem,
  onCategoryMutationResult,
  onMoveCategoryByOffset,
  onMoveItemByOffset,
  onMoveItemToCategory,
  onOpenQuickAdd,
  onRequestDelete,
  onToggleCollapse,
  optimisticCategories,
}: WishlistActiveViewProps) {
  const hasCategorySections =
    customCategories.length > 0 || defaultCategory !== null;

  const renderCategoryCard = (
    category:
      | WishlistCategory
      | { id: null; name: string; order: number },
  ) => {
    const categoryKey = categoryKeyFromId(category.id);
    return (
      <WishlistCategoryCard
        key={categoryKey}
        category={category}
        isOwner={isOwner}
        isPublicView={isPublicView}
        canReorder={canReorder}
        isItemReorderMode={isItemReorderMode}
        isCategoryReorderMode={isCategoryReorderMode}
        isCollapsed={
          isItemReorderMode ? false : Boolean(collapsed[categoryKey])
        }
        isCategoryDropHighlighted={
          isItemReorderMode &&
          itemDropTargetCategoryKey === categoryKey &&
          activeItemCategoryKey !== categoryKey
        }
        dragState={dragState}
        itemsForCategory={getItemsForCategory(
          category.id,
          itemById,
          itemIdsByCategoryKey,
        )}
        itemIds={itemIdsByCategoryKey[categoryKey] ?? []}
        optimisticCategories={optimisticCategories}
        moveTargets={moveTargets}
        onToggleCollapse={() => onToggleCollapse(category.id)}
        onOpenQuickAdd={onOpenQuickAdd}
        onMoveItemByOffset={onMoveItemByOffset}
        onMoveItemToCategory={onMoveItemToCategory}
        onStatusChange={handleStatusChange}
      />
    );
  };

  let content;
  if (isCategoryReorderMode) {
    content = (
      <OrganizeCategoriesPanel
        customCategories={customCategories}
        defaultCategory={defaultCategory}
        dragState={dragState}
        itemIdsByCategoryKey={itemIdsByCategoryKey}
        onMoveCategoryByOffset={onMoveCategoryByOffset}
        onMutationResult={onCategoryMutationResult}
        onRequestDelete={onRequestDelete}
      />
    );
  } else if (hasCategorySections) {
    content = (
      <div className="space-y-6">
        {defaultCategory ? renderCategoryCard(defaultCategory) : null}
        {customCategories.map((category) => renderCategoryCard(category))}
      </div>
    );
  } else if (isItemReorderMode) {
    // Flat wishlist (no categories yet) in Organize mode: one plain
    // sortable list, no section chrome.
    content = (
      <CategoryReorderBody
        canReorder={canReorder}
        category={{ id: null, name: DEFAULT_CATEGORY_NAME, order: -1 }}
        dragState={dragState}
        itemIds={itemIdsByCategoryKey[DEFAULT_CATEGORY_KEY] ?? []}
        itemsForCategory={getItemsForCategory(
          null,
          itemById,
          itemIdsByCategoryKey,
        )}
        moveTargets={moveTargets}
        onMoveItemByOffset={onMoveItemByOffset}
        onMoveItemToCategory={onMoveItemToCategory}
      />
    );
  } else {
    // Flat wishlist: items straight on the page, no category chrome.
    content = (
      <CategoryItemsGrid
        dragState={dragState}
        isOwner={isOwner}
        isPublicView={isPublicView}
        itemsForCategory={getItemsForCategory(
          null,
          itemById,
          itemIdsByCategoryKey,
        )}
        onStatusChange={handleStatusChange}
        optimisticCategories={optimisticCategories}
      />
    );
  }

  return (
    <div
      className={`space-y-4 ${
        isOwner && !isItemReorderMode && !isCategoryReorderMode
          ? 'pb-[calc(theme(spacing.24)+env(safe-area-inset-bottom))] sm:pb-0'
          : 'pb-2'
      }`}
    >
      {content}
      {activeItems.length === 0 && !isItemReorderMode && !isCategoryReorderMode ? (
        <WishlistEmptyState
          archivedItemsCount={archivedItems.length}
          displayName={displayName}
          isOwner={isOwner}
          onAddFirstItem={onAddFirstItem}
        />
      ) : null}
    </div>
  );
}

function getItemsForCategory(
  categoryId: string | null,
  itemById: Map<string, WishlistItem>,
  itemIdsByCategoryKey: Record<string, string[]>,
) {
  return (itemIdsByCategoryKey[categoryKeyFromId(categoryId)] ?? [])
    .map((id) => itemById.get(id))
    .filter(isWishlistItem);
}

function useWishlistViewParam(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
) {
  const initialView =
    searchParams.get('view') === 'past'
      ? ('past' as const)
      : ('wishlist' as const);
  const [view, setView] = useState<WishlistView>(initialView);

  const handleViewChange = useCallback(
    (next: WishlistView) => {
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

  useEffect(() => {
    setView(searchParams.get('view') === 'past' ? 'past' : 'wishlist');
  }, [searchParams]);

  return { handleViewChange, view };
}

// Surfaces the shared delete fetcher's settled result to the optimistic
// category state, so a deleted category doesn't flash back between the
// fetcher settling and loader revalidation landing.
function useDeleteMutationResult(
  actionFetcher: ReturnType<typeof useFetcher>,
  onCategoryMutationResult: (result: CategoryMutationResult) => void,
) {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (actionFetcher.state !== 'idle') return;
    const result = actionFetcher.data as CategoryMutationResult | undefined;
    if (!result?.ok || !result.clientMutationId) return;
    if (handledRef.current === result.clientMutationId) return;
    handledRef.current = result.clientMutationId;
    onCategoryMutationResult(result);
  }, [actionFetcher.data, actionFetcher.state, onCategoryMutationResult]);
}

export const Wishlist = ({
  user,
  isOwner,
  origin,
  publicShare,
  isPublicView = false,
}: WishlistProps) => {
  const displayName = user.name ?? user.username;
  const [searchParams, setSearchParams] = useSearchParams();
  const { handleViewChange, view } = useWishlistViewParam(
    searchParams,
    setSearchParams,
  );

  // orderedCategories lives here — written by both category mutations hook and reorder hook
  const [orderedCategories, setOrderedCategories] = useState(() =>
    [...user.wishlistCategories].sort((a, b) => a.order - b.order),
  );

  const quickAddEditorRef = useRef<WishlistItemEditorHandle>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<string | null>(
    null,
  );

  const toggleCategoryCollapse = useCallback((id: string | null) => {
    setCollapsed((prev) => ({
      ...prev,
      [id ?? 'default']: !prev[id ?? 'default'],
    }));
  }, []);

  const openQuickAdd = useCallback((categoryId: string | null) => {
    setQuickAddCategoryId(categoryId);
    requestAnimationFrame(() => {
      quickAddEditorRef.current?.openCreate();
    });
  }, []);

  // Deep link from the dashboard: /wishlist?add=1 opens the add-item editor
  // immediately instead of making the user find the Add button a second
  // time (June 2026 audit). Param is consumed so refresh doesn't re-open.
  useEffect(() => {
    if (!isOwner || searchParams.get('add') !== '1') return;
    openQuickAdd(null);
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // actionFetcher owns the category delete flow
  const actionFetcher = useFetcher();
  useToast((actionFetcher.data as any)?.toast);

  // --- Hooks ---

  const {
    items,
    setItems,
    showEducation,
    markEducationSeen,
    handleStatusChange,
  } = useWishlistStatusUpdate({
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

  useDeleteMutationResult(actionFetcher, handleCategoryMutationResult);

  const { activeItems, archivedItems } = useWishlistItemMutations({
    items,
    userId: user.id,
  });

  // --- Derived values ---

  const categories = buildWishlistCategories(activeItems, optimisticCategories);

  const handleConfirmDeleteCategory = useCallback(() => {
    if (!pendingDeleteCategory) return;
    Promise.resolve(
      actionFetcher.submit(
        {
          intent: 'delete',
          id: pendingDeleteCategory.id,
          clientMutationId: createClientMutationId(),
        },
        {
          method: 'post',
          action: '/wishlist/categories',
        },
      ),
    ).catch(() => {});
    setPendingDeleteCategory(null);
  }, [actionFetcher, pendingDeleteCategory, setPendingDeleteCategory]);

  const itemIdsByCategoryKey = useMemo(() => {
    const grouped: Record<string, string[]> = {
      [DEFAULT_CATEGORY_KEY]: [],
    };
    for (const category of optimisticCategories) {
      grouped[category.id] = [];
    }
    for (const item of activeItems) {
      const key = categoryKeyFromId(item.categoryId ?? null);
      (grouped[key] ??= []).push(item.id);
    }
    return grouped;
  }, [activeItems, optimisticCategories]);

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
    moveCategoryByOffset,
    moveItemByOffset,
    moveItemToCategory,
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
    dragging?.type === 'item' ? dragging.dragId.replace(/^item:/, '') : null;
  const activeItemCategoryKey = activeItemId
    ? categoryKeyFromId(itemById.get(activeItemId)?.categoryId ?? null)
    : null;

  const defaultCategory =
    (categories.find((category) => category.id === null) as
      | { id: null; name: string; order: number }
      | undefined) ?? null;
  const customCategories = categories.filter(
    (category): category is WishlistCategory => category.id !== null,
  );

  // Targets for the non-drag "move to category" control. Default is always
  // a valid destination once custom categories exist.
  const moveTargets: MoveTargetCategory[] =
    optimisticCategories.length > 0
      ? [
          { id: null, name: DEFAULT_CATEGORY_NAME },
          ...optimisticCategories,
        ]
      : [];

  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setPendingDeleteCategory(null);
      }
    },
    [setPendingDeleteCategory],
  );

  // Always available for owners, independent of current item/category
  // count — this is the only entry point for creating a first category
  // (mirrors the previous CategoryManager control, which was unconditional).
  const showOrganize = canReorder;
  const showViewToggle = archivedItems.length > 0 || view === 'past';

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
        showOrganize={showOrganize}
        onStartOrganize={startItemReorderMode}
      />
      {!isReorderMode ? (
        <WishlistNote note={user.wishlistNote ?? null} isOwner={isOwner} />
      ) : null}
      <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 px-3 py-8 sm:px-6">
        <Stack gap={4}>
          {showViewToggle ? (
            <WishlistViewToggle view={view} onChange={handleViewChange} />
          ) : null}

          {showEducation && view === 'wishlist' ? (
            <PastEducationCallout
              onDismissEducation={markEducationSeen}
              onViewPast={() => {
                handleViewChange('past');
              }}
            />
          ) : null}

          {isReorderMode ? (
            <OrganizeBanner
              isCategoryReorderMode={isCategoryReorderMode}
              isItemReorderMode={isItemReorderMode}
              onDone={finishReorderMode}
              onModeChange={(mode) => {
                if (mode === 'items') {
                  startItemReorderMode();
                } else {
                  startCategoryReorderMode();
                }
              }}
            />
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
              <WishlistActiveView
                activeItemCategoryKey={activeItemCategoryKey}
                activeItems={activeItems}
                archivedItems={archivedItems}
                canReorder={canReorder}
                collapsed={collapsed}
                customCategories={customCategories}
                defaultCategory={defaultCategory}
                displayName={displayName}
                dragState={dragState}
                handleStatusChange={handleStatusChange}
                isCategoryReorderMode={isCategoryReorderMode}
                isItemReorderMode={isItemReorderMode}
                isOwner={isOwner}
                isPublicView={isPublicView}
                itemById={itemById}
                itemDropTargetCategoryKey={itemDropTargetCategoryKey}
                itemIdsByCategoryKey={itemIdsByCategoryKey}
                moveTargets={moveTargets}
                onAddFirstItem={() => openQuickAdd(null)}
                onCategoryMutationResult={handleCategoryMutationResult}
                onMoveCategoryByOffset={moveCategoryByOffset}
                onMoveItemByOffset={moveItemByOffset}
                onMoveItemToCategory={moveItemToCategory}
                onOpenQuickAdd={openQuickAdd}
                onRequestDelete={setPendingDeleteCategory}
                onToggleCollapse={toggleCategoryCollapse}
                optimisticCategories={optimisticCategories}
              />
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
          <p className="pt-2 text-center text-xs text-muted-foreground/70">
            Some product links are affiliate links — GiftPool may earn a small
            commission, at no cost to you.{' '}
            <a
              href="/support#affiliate"
              className="underline underline-offset-2 hover:text-muted-foreground"
            >
              Learn more
            </a>
          </p>
        </Stack>
      </div>
      <DeleteCategoryDialog
        actionFetcherState={actionFetcher.state}
        onConfirm={handleConfirmDeleteCategory}
        onOpenChange={handleDeleteDialogOpenChange}
        pendingDeleteCategory={pendingDeleteCategory}
      />
    </div>
  );
};
