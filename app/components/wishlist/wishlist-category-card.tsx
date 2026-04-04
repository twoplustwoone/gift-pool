import {
  type DraggableAttributes,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type FormEvent, type ReactNode } from 'react';
import { LuArrowUpDown, LuCheck, LuGripVertical, LuPencil, LuPlus, LuTrash, LuX } from 'react-icons/lu';
import  { type useFetcher } from 'react-router';

import { Button } from '#app/components/ui/button';
import { Input } from '#app/components/ui/input';
import  { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

import { Heading } from '../ui/heading';
import { Icon } from '../ui/icon';
import { Flex, Grid, Text } from '../ui-kit';
import  { type WishlistCategory } from './wishlist-category-state';
import { WishlistItem as WishlistItemComponent } from './wishlist-item';
import  { type WishlistItem, toCategoryDropId, toItemDragId  } from './wishlist-item-state';
import {
  WishlistRowActionsItem,
  WishlistRowActionsMenu,
} from './wishlist-row-actions';

type SortableListeners = ReturnType<typeof useSortable>['listeners'];

const DragHandle = ({
  label,
  disabled = false,
  active = false,
  attributes,
  listeners,
  setActivatorNodeRef,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  attributes: DraggableAttributes;
  listeners: SortableListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}) => (
  <button
    type="button"
    ref={setActivatorNodeRef}
    aria-label={label}
    disabled={disabled}
    className={`inline-flex h-10 w-10 touch-none items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground active:scale-[0.98] ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''
      } disabled:cursor-not-allowed disabled:opacity-40`}
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}
    {...attributes}
    {...listeners}
  >
    <LuGripVertical className="h-4 w-4" aria-hidden />
  </button>
);

const HeaderDropTarget = ({
  categoryKey,
  highlighted,
  dragState,
  categoryName,
  children,
}: {
  categoryKey: string;
  highlighted: boolean;
  dragState: 'idle' | 'dragging-item' | 'dragging-category';
  categoryName: string;
  children: ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: toCategoryDropId(categoryKey),
  });
  const isActiveTarget = highlighted || isOver;

  return (
    <div
      ref={setNodeRef}
      data-drop-target={isActiveTarget ? 'true' : 'false'}
      className={`relative rounded-xl transition ${isActiveTarget
          ? 'bg-emerald-50/90 ring-2 ring-emerald-300'
          : dragState === 'dragging-item'
            ? 'bg-background/70'
            : ''
        }`}
    >
      {children}
      {isActiveTarget && dragState === 'dragging-item' ? (
        <div className="pointer-events-none absolute right-3 top-2">
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Move to {categoryName}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export const SortableShell = ({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: (args: {
    attributes: DraggableAttributes;
    listeners: SortableListeners;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
    isDragging: boolean;
  }) => ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {children({
        attributes,
        listeners,
        setActivatorNodeRef,
        isDragging,
      })}
    </div>
  );
};

export type CategoryHandle = {
  attributes: DraggableAttributes;
  listeners: SortableListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  isDragging: boolean;
};

export type CategoryCardProps = {
  category: { id: string | null; name: string; order: number };
  isOwner: boolean;
  isPublicView: boolean;
  canReorder: boolean;
  isItemReorderMode: boolean;
  isCategoryReorderMode: boolean;
  isCollapsed: boolean;
  isEditing: boolean;
  isCategoryDropHighlighted: boolean;
  dragState: 'idle' | 'dragging-item' | 'dragging-category';
  itemsForCategory: WishlistItem[];
  itemIds: string[];
  optimisticCategories: WishlistCategory[];
  actionFetcher: ReturnType<typeof useFetcher>;
  onToggleCollapse: () => void;
  onSetEditing: (id: string | null) => void;
  onRequestDelete: (category: { id: string; name: string }) => void;
  onOpenQuickAdd: (categoryId: string | null) => void;
  onStartItemReorder: () => void;
  onStartCategoryReorder: () => void;
  onStatusChange: (itemId: string, status: WishlistItemStatusValue) => void;
  onAttachClientMutationId: (event: FormEvent<HTMLFormElement>) => void;
  categoryHandle?: CategoryHandle;
};
type CategoryItemsGridProps = Readonly<
  Pick<
    CategoryCardProps,
    | 'dragState'
    | 'isOwner'
    | 'isPublicView'
    | 'itemsForCategory'
    | 'onStatusChange'
    | 'optimisticCategories'
  >
>;
type CategoryReorderBodyProps = Readonly<
  Pick<CategoryCardProps, 'canReorder' | 'dragState' | 'itemIds' | 'itemsForCategory'>
>;
type WishlistCategoryBodyProps = Readonly<
  Pick<
    CategoryCardProps,
    | 'canReorder'
    | 'dragState'
    | 'isCollapsed'
    | 'isItemReorderMode'
    | 'isOwner'
    | 'isPublicView'
    | 'itemIds'
    | 'itemsForCategory'
    | 'onStatusChange'
    | 'optimisticCategories'
  >
>;
type CategoryActionsMenuProps = Readonly<
  Pick<
    CategoryCardProps,
    | 'canReorder'
    | 'category'
    | 'isCategoryReorderMode'
    | 'isItemReorderMode'
    | 'isOwner'
    | 'onOpenQuickAdd'
    | 'onRequestDelete'
    | 'onSetEditing'
    | 'onStartCategoryReorder'
    | 'onStartItemReorder'
  >
>;
type CategoryEditFormProps = Readonly<
  Pick<
    CategoryCardProps,
    'actionFetcher' | 'category' | 'onAttachClientMutationId' | 'onSetEditing'
  >
>;
type CategoryTitleProps = Readonly<{
  category: CategoryCardProps['category'];
  count: number;
}>;
type CategoryHeaderProps = Readonly<
  Pick<
    CategoryCardProps,
    | 'category'
    | 'categoryHandle'
    | 'canReorder'
    | 'isCategoryReorderMode'
    | 'isEditing'
    | 'isItemReorderMode'
    | 'isOwner'
    | 'isCollapsed'
    | 'itemsForCategory'
    | 'actionFetcher'
    | 'onAttachClientMutationId'
    | 'onOpenQuickAdd'
    | 'onRequestDelete'
    | 'onSetEditing'
    | 'onStartCategoryReorder'
    | 'onStartItemReorder'
    | 'onToggleCollapse'
  >
>;

function CategoryItemsGrid({
  dragState,
  isOwner,
  isPublicView,
  itemsForCategory,
  onStatusChange,
  optimisticCategories,
}: CategoryItemsGridProps) {
  return (
    <Grid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} gap={3}>
      {itemsForCategory.map((item) => (
        <WishlistItemComponent
          key={item.id}
          wishlistItem={item}
          isOwner={isOwner}
          categories={optimisticCategories}
          disableClaims={isPublicView}
          layout="default"
          isReorderMode={false}
          dragState={dragState}
          onStatusChange={onStatusChange}
        />
      ))}
    </Grid>
  );
}

function CategoryReorderBody({
  canReorder,
  dragState,
  itemIds,
  itemsForCategory,
}: CategoryReorderBodyProps) {
  return (
    <SortableContext
      items={itemIds.map((itemId) => toItemDragId(itemId))}
      strategy={rectSortingStrategy}
    >
      <div className="space-y-2">
        {itemsForCategory.map((item) => (
          <SortableShell
            key={item.id}
            id={toItemDragId(item.id)}
            disabled={!canReorder}
          >
            {({
              attributes,
              listeners,
              setActivatorNodeRef,
              isDragging,
            }) => (
              <div
                data-testid="wishlist-item-row"
                data-drag-state={dragState}
                data-drop-target="false"
                className={`flex items-center gap-3 rounded-xl border border-border/80 bg-card px-3 py-2 shadow-sm transition ${
                  isDragging
                    ? 'border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-300'
                    : ''
                }`}
              >
                <DragHandle
                  label={`Drag item ${item.title}`}
                  active={isDragging}
                  attributes={attributes}
                  listeners={listeners}
                  setActivatorNodeRef={setActivatorNodeRef}
                />
                <Text weight="medium" className="truncate">
                  {item.title}
                </Text>
              </div>
            )}
          </SortableShell>
        ))}
        {itemsForCategory.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Drop item here
          </div>
        ) : null}
      </div>
    </SortableContext>
  );
}

function WishlistCategoryBody({
  canReorder,
  dragState,
  isCollapsed,
  isItemReorderMode,
  isOwner,
  isPublicView,
  itemIds,
  itemsForCategory,
  onStatusChange,
  optimisticCategories,
}: WishlistCategoryBodyProps) {
  if (isCollapsed && !isItemReorderMode) return null;

  return (
    <div className="border-t border-card-border p-3 sm:p-4">
      {isItemReorderMode ? (
        <CategoryReorderBody
          canReorder={canReorder}
          dragState={dragState}
          itemIds={itemIds}
          itemsForCategory={itemsForCategory}
        />
      ) : (
        <CategoryItemsGrid
          dragState={dragState}
          isOwner={isOwner}
          isPublicView={isPublicView}
          itemsForCategory={itemsForCategory}
          onStatusChange={onStatusChange}
          optimisticCategories={optimisticCategories}
        />
      )}
    </div>
  );
}

function CategoryActionsMenu({
  canReorder,
  category,
  isCategoryReorderMode,
  isItemReorderMode,
  isOwner,
  onOpenQuickAdd,
  onRequestDelete,
  onSetEditing,
  onStartCategoryReorder,
  onStartItemReorder,
}: CategoryActionsMenuProps) {
  if (!isOwner || isItemReorderMode || isCategoryReorderMode) return null;

  return (
    <WishlistRowActionsMenu label={`Category actions for ${category.name}`}>
      <WishlistRowActionsItem onSelect={() => onOpenQuickAdd(category.id ?? null)}>
        <LuPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
        Add item
      </WishlistRowActionsItem>
      {canReorder ? (
        <WishlistRowActionsItem onSelect={onStartItemReorder}>
          <LuArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          Reorder items
        </WishlistRowActionsItem>
      ) : null}
      {canReorder ? (
        <WishlistRowActionsItem onSelect={onStartCategoryReorder}>
          <LuArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          Reorder categories
        </WishlistRowActionsItem>
      ) : null}
      {category.id ? (
        <WishlistRowActionsItem onSelect={() => onSetEditing(category.id)}>
          <LuPencil className="h-4 w-4 text-muted-foreground" aria-hidden />
          Rename category
        </WishlistRowActionsItem>
      ) : null}
      {category.id ? (
        <WishlistRowActionsItem
          className="text-red-600 focus:text-red-700"
          onSelect={() =>
            onRequestDelete({
              id: category.id!,
              name: category.name,
            })
          }
        >
          <LuTrash className="h-4 w-4" aria-hidden />
          Delete category
        </WishlistRowActionsItem>
      ) : null}
    </WishlistRowActionsMenu>
  );
}

function CategoryEditForm({
  actionFetcher,
  category,
  onAttachClientMutationId,
  onSetEditing,
}: CategoryEditFormProps) {
  return (
    <actionFetcher.Form
      method="post"
      action="/wishlist/categories"
      className="flex items-center gap-2"
      onClick={(event) => event.stopPropagation()}
      onSubmit={onAttachClientMutationId}
    >
      <input type="hidden" name="intent" value="rename" />
      <input type="hidden" name="id" value={category.id ?? ''} />
      <input type="hidden" name="clientMutationId" value="" />
      <Input name="name" defaultValue={category.name} className="h-8" />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        aria-label="Save category"
        onClick={(event) => event.stopPropagation()}
      >
        <LuCheck />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Cancel"
        onClick={(event) => {
          event.stopPropagation();
          onSetEditing(null);
        }}
      >
        <LuX />
      </Button>
    </actionFetcher.Form>
  );
}

function CategoryTitle({
  category,
  count,
}: CategoryTitleProps) {
  return (
    <Heading>
      <Flex align="center" gap={2}>
        <Text weight="bold" className="truncate">
          {category.name}
        </Text>
        <Text className="text-muted-foreground" size="xs" weight="bold">
          ({count})
        </Text>
      </Flex>
    </Heading>
  );
}

function CategoryHeader({
  actionFetcher,
  canReorder,
  category,
  categoryHandle,
  isCategoryReorderMode,
  isCollapsed,
  isEditing,
  isItemReorderMode,
  isOwner,
  itemsForCategory,
  onAttachClientMutationId,
  onOpenQuickAdd,
  onRequestDelete,
  onSetEditing,
  onStartCategoryReorder,
  onStartItemReorder,
  onToggleCollapse,
}: CategoryHeaderProps) {
  const canToggleCollapse =
    !isEditing && !isItemReorderMode && !isCategoryReorderMode;
  const titleContent = (
    <>
      {!isItemReorderMode ? (
        <Icon
          name={isCollapsed ? 'chevron-right' : 'chevron-down'}
          className="h-4 w-4"
        />
      ) : null}
      {isEditing ? (
        <CategoryEditForm
          actionFetcher={actionFetcher}
          category={category}
          onAttachClientMutationId={onAttachClientMutationId}
          onSetEditing={onSetEditing}
        />
      ) : (
        <CategoryTitle category={category} count={itemsForCategory.length} />
      )}
    </>
  );

  return (
    <div
      className={`flex min-h-14 items-center justify-between gap-2 rounded-t-xl bg-surface ${
        canToggleCollapse ? 'hover:bg-muted' : ''
      }`}
    >
      {canToggleCollapse ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-tl-xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4"
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapse}
        >
          {titleContent}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 sm:px-4">
          {titleContent}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        {categoryHandle ? (
          <DragHandle
            label={`Drag category ${category.name}`}
            active={Boolean(categoryHandle.isDragging)}
            attributes={categoryHandle.attributes}
            listeners={categoryHandle.listeners}
            setActivatorNodeRef={categoryHandle.setActivatorNodeRef}
          />
        ) : null}
        <CategoryActionsMenu
          canReorder={canReorder}
          category={category}
          isCategoryReorderMode={isCategoryReorderMode}
          isItemReorderMode={isItemReorderMode}
          isOwner={isOwner}
          onOpenQuickAdd={onOpenQuickAdd}
          onRequestDelete={onRequestDelete}
          onSetEditing={onSetEditing}
          onStartCategoryReorder={onStartCategoryReorder}
          onStartItemReorder={onStartItemReorder}
        />
      </div>
    </div>
  );
}

export const WishlistCategoryCard = ({
  category,
  isOwner,
  isPublicView,
  canReorder,
  isItemReorderMode,
  isCategoryReorderMode,
  isCollapsed,
  isEditing,
  isCategoryDropHighlighted,
  dragState,
  itemsForCategory,
  itemIds,
  optimisticCategories,
  actionFetcher,
  onToggleCollapse,
  onSetEditing,
  onRequestDelete,
  onOpenQuickAdd,
  onStartItemReorder,
  onStartCategoryReorder,
  onStatusChange,
  onAttachClientMutationId,
  categoryHandle,
}: CategoryCardProps) => {
  const categoryKey = category.id ?? 'default';

  return (
    <div
      className={`group overflow-hidden rounded-xl border border-border/90 bg-surface shadow-sm transition ${dragState === 'dragging-item' && !isCategoryDropHighlighted
          ? 'opacity-85'
          : ''
        }`}
      data-testid="wishlist-category-row"
      data-drag-state={dragState}
      data-drop-target={isCategoryDropHighlighted ? 'true' : 'false'}
    >
      <HeaderDropTarget
        categoryKey={categoryKey}
        highlighted={isCategoryDropHighlighted}
        dragState={dragState}
        categoryName={category.name}
      >
        <CategoryHeader
          actionFetcher={actionFetcher}
          canReorder={canReorder}
          category={category}
          categoryHandle={categoryHandle}
          isCategoryReorderMode={isCategoryReorderMode}
          isCollapsed={isCollapsed}
          isEditing={isEditing}
          isItemReorderMode={isItemReorderMode}
          isOwner={isOwner}
          itemsForCategory={itemsForCategory}
          onAttachClientMutationId={onAttachClientMutationId}
          onOpenQuickAdd={onOpenQuickAdd}
          onRequestDelete={onRequestDelete}
          onSetEditing={onSetEditing}
          onStartCategoryReorder={onStartCategoryReorder}
          onStartItemReorder={onStartItemReorder}
          onToggleCollapse={onToggleCollapse}
        />
      </HeaderDropTarget>
      <WishlistCategoryBody
        canReorder={canReorder}
        dragState={dragState}
        isCollapsed={isCollapsed}
        isItemReorderMode={isItemReorderMode}
        isOwner={isOwner}
        isPublicView={isPublicView}
        itemIds={itemIds}
        itemsForCategory={itemsForCategory}
        onStatusChange={onStatusChange}
        optimisticCategories={optimisticCategories}
      />
    </div>
  );
};
