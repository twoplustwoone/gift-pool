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
import { WishlistNote } from './wishlist-note';

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
type WishlistReorderBannerProps = Readonly<{
  finishReorderMode: () => void;
  isCategoryReorderMode: boolean;
  isItemReorderMode: boolean;
  startCategoryReorderMode: () => void;
  startItemReorderMode: () => void;
}>;
type CategoryReorderListProps = Readonly<{
  customCategories: Array<{ id: string; name: string; order: number }>;
  defaultCategory: { id: null; name: string; order: number } | null;
  dragState: string;
  itemIdsByCategoryKey: Record<string, string[]>;
}>;
type WishlistEmptyStateProps = Readonly<{
  archivedItemsCount: number;
  displayName: string;
  isOwner: boolean;
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
type WishlistUiState = {
  collapsed: Record<string, boolean>;
  editingId: string | null;
  pendingDeleteCategory: { id: string; name: string } | null;
  quickAddCategoryId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingDeleteCategory: React.Dispatch<
    React.SetStateAction<{ id: string; name: string } | null>
  >;
  openQuickAdd: (categoryId: string | null) => void;
  toggleCategoryCollapse: (id: string | null) => void;
};
type WishlistActiveViewProps = Readonly<{
  actionFetcher: ReturnType<typeof useFetcher>;
  activeItemCategoryKey: string | null;
  activeItems: WishlistItem[];
  archivedItems: WishlistItem[];
  canReorder: boolean;
  collapsed: Record<string, boolean>;
  customCategories: Array<{ id: string; name: string; order: number }>;
  defaultCategory: { id: null; name: string; order: number } | null;
  displayName: string;
  dragState: ReturnType<typeof useWishlistReorder>['dragState'];
  editingId: string | null;
  finishReorderMode: () => void;
  handleDragCancel: () => void;
  handleDragEnd: (event: any) => void;
  handleDragOver: (event: any) => void;
  handleDragStart: (event: any) => void;
  handleStatusChange: (
    itemId: string,
    status: any,
  ) => boolean | void;
  isCategoryReorderMode: boolean;
  isItemReorderMode: boolean;
  isOwner: boolean;
  isPublicView: boolean;
  isReorderMode: boolean;
  itemById: Map<string, WishlistItem>;
  itemDropTargetCategoryKey: string | null;
  itemIdsByCategoryKey: Record<string, string[]>;
  onAttachClientMutationId: (event: FormEvent<HTMLFormElement>) => void;
  onOpenQuickAdd: (categoryId: string | null) => void;
  onRequestDelete: React.Dispatch<
    React.SetStateAction<{ id: string; name: string } | null>
  >;
  onSetEditing: React.Dispatch<React.SetStateAction<string | null>>;
  onToggleCollapse: (id: string | null) => void;
  optimisticCategories: WishlistCategory[];
  reorderMode: 'off' | 'items' | 'categories';
  sensors: ReturnType<typeof useWishlistReorder>['sensors'];
  startCategoryReorderMode: () => void;
  startItemReorderMode: () => void;
}>;
type WishlistContentProps = WishlistActiveViewProps &
  Readonly<{
    handleViewChange: (view: WishlistView) => void;
    markEducationSeen: () => void;
    showEducation: boolean;
    view: WishlistView;
  }>;
type WishlistCategorySectionsProps = Readonly<{
  actionFetcher: ReturnType<typeof useFetcher>;
  activeItemCategoryKey: string | null;
  canReorder: boolean;
  collapsed: Record<string, boolean>;
  customCategories: Array<{ id: string; name: string; order: number }>;
  defaultCategory: { id: null; name: string; order: number } | null;
  dragState: ReturnType<typeof useWishlistReorder>['dragState'];
  editingId: string | null;
  handleStatusChange: (itemId: string, status: any) => boolean | void;
  isCategoryReorderMode: boolean;
  isItemReorderMode: boolean;
  isOwner: boolean;
  isPublicView: boolean;
  itemById: Map<string, WishlistItem>;
  itemDropTargetCategoryKey: string | null;
  itemIdsByCategoryKey: Record<string, string[]>;
  onAttachClientMutationId: (event: FormEvent<HTMLFormElement>) => void;
  onOpenQuickAdd: (categoryId: string | null) => void;
  onRequestDelete: React.Dispatch<
    React.SetStateAction<{ id: string; name: string } | null>
  >;
  onSetEditing: React.Dispatch<React.SetStateAction<string | null>>;
  onToggleCollapse: (id: string | null) => void;
  optimisticCategories: WishlistCategory[];
  startCategoryReorderMode: () => void;
  startItemReorderMode: () => void;
}>;

function isWishlistItem(value: WishlistItem | undefined): value is WishlistItem {
  return Boolean(value);
}

function buildWishlistCategories(
  activeItems: WishlistItem[],
  isOwner: boolean,
  optimisticCategories: WishlistCategory[],
) {
  const hasDefaultItems = activeItems.some((item) => item.categoryId === null);
  return [
    { id: null, name: 'Default (Uncategorized)', order: -1 },
    ...optimisticCategories,
  ].filter((category) => {
    if (category.id !== null) return true;
    // Always show the Default bucket when it has items — it's where the items
    // live. For owners with no items in Default, only show it when there are
    // NO custom categories either, so first-time users still have a landing
    // spot to drop their first item. Otherwise the owner sees "Default (0)"
    // as permanent visual noise.
    if (hasDefaultItems) return true;
    if (isOwner) return optimisticCategories.length === 0;
    return false;
  });
}

function useWishlistActionFetcherReset(
  actionFetcher: ReturnType<typeof useFetcher>,
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>,
) {
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
  }, [actionFetcher.data, actionFetcher.state, setEditingId]);
}

function useAttachClientMutationIdToForm() {
  return useCallback((event: FormEvent<HTMLFormElement>) => {
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
  }, []);
}

function useWishlistUiState(
  quickAddEditorRef: React.RefObject<WishlistItemEditorHandle | null>,
): WishlistUiState {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const openQuickAdd = useCallback(
    (categoryId: string | null) => {
      setQuickAddCategoryId(categoryId);
      requestAnimationFrame(() => {
        quickAddEditorRef.current?.openCreate();
      });
    },
    [quickAddEditorRef],
  );

  return {
    collapsed,
    editingId,
    pendingDeleteCategory,
    quickAddCategoryId,
    setEditingId,
    setPendingDeleteCategory,
    openQuickAdd,
    toggleCategoryCollapse,
  };
}

function WishlistViewToggle({
  onChange,
  view,
}: WishlistViewToggleProps) {
  return (
    <div className="inline-flex w-full max-w-md rounded-full bg-muted p-1 text-sm">
      <button
        type="button"
        className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${
          view === 'wishlist'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground'
        }`}
        aria-pressed={view === 'wishlist'}
        onClick={() => onChange('wishlist')}
      >
        Wishlist
      </button>
      <button
        type="button"
        className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${
          view === 'past'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground'
        }`}
        aria-pressed={view === 'past'}
        onClick={() => onChange('past')}
      >
        Past items
      </button>
    </div>
  );
}

function WishlistReorderBanner({
  finishReorderMode,
  isCategoryReorderMode,
  isItemReorderMode,
  startCategoryReorderMode,
  startItemReorderMode,
}: WishlistReorderBannerProps) {
  return (
    <div className="sticky top-2 z-20 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Text size="sm" weight="bold" className="text-emerald-900">
            Reorder mode
          </Text>
          <Text size="xs" className="text-emerald-800">
            Drag handles to move {isCategoryReorderMode ? 'categories' : 'items'}.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-emerald-200 bg-background/80 p-1 text-xs">
            <button
              type="button"
              aria-label="Item reorder mode"
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                isItemReorderMode
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
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                isCategoryReorderMode
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
  );
}

function CategoryReorderList({
  customCategories,
  defaultCategory,
  dragState,
  itemIdsByCategoryKey,
}: CategoryReorderListProps) {
  return (
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
              ({itemIdsByCategoryKey[DEFAULT_CATEGORY_KEY]?.length ?? 0})
            </Text>
          </div>
        </div>
      ) : null}
      <SortableContext
        items={customCategories.map((category) => toCategoryDragId(category.id))}
        strategy={rectSortingStrategy}
      >
        {customCategories.map((category) => (
          <SortableShell key={category.id} id={toCategoryDragId(category.id)}>
            {({ attributes, listeners, setActivatorNodeRef, isDragging }) => (
              <div
                className={`rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-sm transition ${
                  isDragging
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
                    onPointerDown={(event) => event.stopPropagation()}
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
                      <Text size="xs" className="text-muted-foreground">
                        ({itemIdsByCategoryKey[category.id]?.length ?? 0})
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
  );
}

function WishlistEmptyState({
  archivedItemsCount,
  displayName,
  isOwner,
}: WishlistEmptyStateProps) {
  return (
    <div className="flex w-full flex-col items-center justify-center">
      {isOwner ? (
        <p className="text-center text-base text-slate-500">
          Looks like you don't have any items in your wishlist yet!
          {archivedItemsCount ? ' Past items are available in the Past items tab.' : ''}
        </p>
      ) : (
        <p className="text-center text-base text-slate-500">
          {displayName} doesn't have any active items in their wishlist right now!
          {archivedItemsCount
            ? ' Their past items are available in the Past items tab.'
            : ''}
        </p>
      )}
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
    <Dialog
      open={pendingDeleteCategory !== null}
      onOpenChange={onOpenChange}
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
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
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

function WishlistCategorySections({
  actionFetcher,
  activeItemCategoryKey,
  canReorder,
  collapsed,
  customCategories,
  defaultCategory,
  dragState,
  isCategoryReorderMode,
  isItemReorderMode,
  isOwner,
  isPublicView,
  itemById,
  itemDropTargetCategoryKey,
  itemIdsByCategoryKey,
  onAttachClientMutationId,
  onOpenQuickAdd,
  onRequestDelete,
  onSetEditing,
  onToggleCollapse,
  optimisticCategories,
  handleStatusChange,
  editingId,
  startCategoryReorderMode,
  startItemReorderMode,
}: WishlistCategorySectionsProps) {
  const renderCategoryCard = useCallback(
    (
      category: { id: string; name: string; order: number } | { id: null; name: string; order: number },
      categoryKey: string,
      isEditing: boolean,
    ) => (
      <WishlistCategoryCard
        key={categoryKey}
        category={category}
        isOwner={isOwner}
        isPublicView={isPublicView}
        canReorder={canReorder}
        isItemReorderMode={isItemReorderMode}
        isCategoryReorderMode={isCategoryReorderMode}
        isCollapsed={isItemReorderMode ? false : Boolean(collapsed[categoryKey])}
        isEditing={isEditing && !isCategoryReorderMode && !isItemReorderMode}
        isCategoryDropHighlighted={
          isItemReorderMode &&
          itemDropTargetCategoryKey === categoryKey &&
          activeItemCategoryKey !== categoryKey
        }
        dragState={dragState}
        itemsForCategory={getItemsForCategory(category.id, itemById, itemIdsByCategoryKey)}
        itemIds={itemIdsByCategoryKey[categoryKey] ?? []}
        optimisticCategories={optimisticCategories}
        actionFetcher={actionFetcher}
        onToggleCollapse={() => onToggleCollapse(category.id)}
        onSetEditing={onSetEditing}
        onRequestDelete={onRequestDelete}
        onOpenQuickAdd={onOpenQuickAdd}
        onStartItemReorder={startItemReorderMode}
        onStartCategoryReorder={startCategoryReorderMode}
        onStatusChange={handleStatusChange}
        onAttachClientMutationId={onAttachClientMutationId}
      />
    ),
    [
      actionFetcher,
      activeItemCategoryKey,
      canReorder,
      collapsed,
      dragState,
      handleStatusChange,
      isCategoryReorderMode,
      isItemReorderMode,
      isOwner,
      isPublicView,
      itemById,
      itemDropTargetCategoryKey,
      itemIdsByCategoryKey,
      onAttachClientMutationId,
      onOpenQuickAdd,
      onRequestDelete,
      onSetEditing,
      onToggleCollapse,
      optimisticCategories,
      startCategoryReorderMode,
      startItemReorderMode,
    ],
  );

  return (
    <>
      {defaultCategory
        ? renderCategoryCard(defaultCategory, DEFAULT_CATEGORY_KEY, false)
        : null}
      <div className="space-y-4">
        {customCategories.map((category) =>
          renderCategoryCard(category, category.id, editingId === category.id),
        )}
      </div>
    </>
  );
}

function WishlistActiveView({
  actionFetcher,
  activeItemCategoryKey,
  activeItems,
  archivedItems,
  canReorder,
  collapsed,
  customCategories,
  defaultCategory,
  displayName,
  dragState,
  editingId,
  finishReorderMode: _finishReorderMode,
  handleDragCancel,
  handleDragEnd,
  handleDragOver,
  handleDragStart,
  handleStatusChange,
  isCategoryReorderMode,
  isItemReorderMode,
  isOwner,
  isPublicView,
  isReorderMode,
  itemById,
  itemDropTargetCategoryKey,
  itemIdsByCategoryKey,
  onAttachClientMutationId,
  onOpenQuickAdd,
  onRequestDelete,
  onSetEditing,
  onToggleCollapse,
  optimisticCategories,
  sensors,
  startCategoryReorderMode,
  startItemReorderMode,
}: WishlistActiveViewProps) {
  return (
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
        className={`space-y-4 ${
          isOwner && !isReorderMode
            ? 'pb-[calc(theme(spacing.24)+env(safe-area-inset-bottom))] sm:pb-0'
            : 'pb-2'
        }`}
      >
        {isCategoryReorderMode ? (
          <CategoryReorderList
            customCategories={customCategories}
            defaultCategory={defaultCategory}
            dragState={dragState}
            itemIdsByCategoryKey={itemIdsByCategoryKey}
          />
        ) : (
          <WishlistCategorySections
            actionFetcher={actionFetcher}
            activeItemCategoryKey={activeItemCategoryKey}
            canReorder={canReorder}
            collapsed={collapsed}
            customCategories={customCategories}
            defaultCategory={defaultCategory}
            dragState={dragState}
            editingId={editingId}
            handleStatusChange={handleStatusChange}
            isCategoryReorderMode={isCategoryReorderMode}
            isItemReorderMode={isItemReorderMode}
            isOwner={isOwner}
            isPublicView={isPublicView}
            itemById={itemById}
            itemDropTargetCategoryKey={itemDropTargetCategoryKey}
            itemIdsByCategoryKey={itemIdsByCategoryKey}
            onAttachClientMutationId={onAttachClientMutationId}
            onOpenQuickAdd={onOpenQuickAdd}
            onRequestDelete={onRequestDelete}
            onSetEditing={onSetEditing}
            onToggleCollapse={onToggleCollapse}
            optimisticCategories={optimisticCategories}
            startCategoryReorderMode={startCategoryReorderMode}
            startItemReorderMode={startItemReorderMode}
          />
        )}

        {activeItems.length === 0 ? (
          <WishlistEmptyState
            archivedItemsCount={archivedItems.length}
            displayName={displayName}
            isOwner={isOwner}
          />
        ) : null}
      </div>
    </DndContext>
  );
}

function WishlistContent({
  handleViewChange,
  markEducationSeen,
  showEducation,
  view,
  ...activeViewProps
}: WishlistContentProps) {
  if (view === 'wishlist') {
    return <WishlistActiveView {...activeViewProps} />;
  }

  return (
    <PastWishlistItems
      items={activeViewProps.archivedItems}
      isOwner={activeViewProps.isOwner}
      categories={activeViewProps.optimisticCategories}
      showEducation={showEducation}
      onDismissEducation={markEducationSeen}
      onViewPast={() => {
        markEducationSeen();
        handleViewChange('past');
      }}
      onStatusChange={activeViewProps.handleStatusChange}
    />
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

function useWishlistViewParam(searchParams: URLSearchParams, setSearchParams: ReturnType<typeof useSearchParams>[1]) {
  const initialView =
    searchParams.get('view') === 'past' ? ('past' as const) : ('wishlist' as const);
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
  const {
    collapsed,
    editingId,
    pendingDeleteCategory,
    quickAddCategoryId,
    setEditingId,
    setPendingDeleteCategory,
    openQuickAdd,
    toggleCategoryCollapse,
  } = useWishlistUiState(quickAddEditorRef);

  // actionFetcher shared by rename form and delete dialog
  const actionFetcher = useFetcher();
  useWishlistActionFetcherReset(actionFetcher, setEditingId);

  useToast((actionFetcher.data as any)?.toast);
  const attachClientMutationIdToForm = useAttachClientMutationIdToForm();

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

  const categories = buildWishlistCategories(
    activeItems,
    isOwner,
    optimisticCategories,
  );

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

  const defaultCategory =
    categories.find((category) => category.id === null) ?? null;
  const customCategories = categories.filter(
    (category): category is { id: string; name: string; order: number } =>
      category.id !== null,
  );
  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingDeleteCategory(null);
    }
  }, [setPendingDeleteCategory]);

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
      {!isReorderMode ? (
        <WishlistNote note={user.wishlistNote ?? null} isOwner={isOwner} />
      ) : null}
      <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 px-3 py-8 sm:px-6">
        <Stack gap={4}>
          <WishlistViewToggle view={view} onChange={handleViewChange} />

          {showEducation && view === 'wishlist' ? (
            <PastEducationCallout
              onDismissEducation={markEducationSeen}
              onViewPast={() => {
                handleViewChange('past');
              }}
            />
          ) : null}

          {isReorderMode ? (
            <WishlistReorderBanner
              finishReorderMode={finishReorderMode}
              isCategoryReorderMode={isCategoryReorderMode}
              isItemReorderMode={isItemReorderMode}
              startCategoryReorderMode={startCategoryReorderMode}
              startItemReorderMode={startItemReorderMode}
            />
          ) : null}
          <WishlistContent
            actionFetcher={actionFetcher}
            activeItemCategoryKey={activeItemCategoryKey}
            activeItems={activeItems}
            archivedItems={archivedItems}
            canReorder={canReorder}
            collapsed={collapsed}
            customCategories={customCategories}
            defaultCategory={defaultCategory}
            displayName={displayName}
            dragState={dragState}
            editingId={editingId}
            finishReorderMode={finishReorderMode}
            handleDragCancel={handleDragCancel}
            handleDragEnd={handleDragEnd}
            handleDragOver={handleDragOver}
            handleDragStart={handleDragStart}
            handleStatusChange={handleStatusChange}
            handleViewChange={handleViewChange}
            isCategoryReorderMode={isCategoryReorderMode}
            isItemReorderMode={isItemReorderMode}
            isOwner={isOwner}
            isPublicView={isPublicView}
            isReorderMode={isReorderMode}
            itemById={itemById}
            itemDropTargetCategoryKey={itemDropTargetCategoryKey}
            itemIdsByCategoryKey={itemIdsByCategoryKey}
            markEducationSeen={markEducationSeen}
            onAttachClientMutationId={attachClientMutationIdToForm}
            onOpenQuickAdd={openQuickAdd}
            onRequestDelete={setPendingDeleteCategory}
            onSetEditing={setEditingId}
            onToggleCollapse={toggleCategoryCollapse}
            optimisticCategories={optimisticCategories}
            reorderMode={reorderMode}
            sensors={sensors}
            showEducation={showEducation}
            startCategoryReorderMode={startCategoryReorderMode}
            startItemReorderMode={startItemReorderMode}
            view={view}
          />
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
