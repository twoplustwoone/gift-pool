import {
  type DraggableAttributes,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type ReactNode } from 'react';
import {
  LuChevronDown,
  LuChevronUp,
  LuFolderInput,
  LuGripVertical,
  LuPlus,
} from 'react-icons/lu';

import { Button } from '#app/components/ui/button';
import { cn } from '#app/utils/misc.tsx';
import  { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

import { Heading } from '../ui/heading';
import { Icon } from '../ui/icon';
import { Flex, Text } from '../ui-kit';
import  { type WishlistCategory } from './wishlist-category-state';
import { WishlistItem as WishlistItemComponent } from './wishlist-item';
import  { type WishlistItem, toCategoryDropId, toItemDragId  } from './wishlist-item-state';
import {
  WishlistRowActionsItem,
  WishlistRowActionsMenu,
} from './wishlist-row-actions';

type SortableListeners = ReturnType<typeof useSortable>['listeners'];

export const DragHandle = ({
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
    className={`inline-flex h-10 w-10 touch-none items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground active:scale-[0.98] ${active ? 'border-pool/40 bg-pool/10 text-pool' : ''
      } disabled:cursor-not-allowed disabled:opacity-40`}
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}
    {...attributes}
    {...listeners}
  >
    <LuGripVertical className="h-4 w-4" aria-hidden />
  </button>
);

// Non-drag reorder alternative: one-slot up/down moves, keyboard and
// switch-access friendly. Rendered next to every drag handle in Organize
// mode so drag is never the only way to change order.
export const MoveByOffsetButtons = ({
  label,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
}) => (
  <div className="flex items-center">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Move ${label} up`}
      disabled={!canMoveUp}
      className="h-10 w-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
      onClick={(event) => {
        event.stopPropagation();
        onMove(-1);
      }}
    >
      <LuChevronUp className="h-4 w-4" aria-hidden />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Move ${label} down`}
      disabled={!canMoveDown}
      className="h-10 w-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
      onClick={(event) => {
        event.stopPropagation();
        onMove(1);
      }}
    >
      <LuChevronDown className="h-4 w-4" aria-hidden />
    </Button>
  </div>
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
          ? 'bg-pool/10 ring-2 ring-pool/40'
          : dragState === 'dragging-item'
            ? 'bg-background/70'
            : ''
        }`}
    >
      {children}
      {isActiveTarget && dragState === 'dragging-item' ? (
        <div className="pointer-events-none absolute right-3 top-2">
          <span className="rounded-full bg-pool/10 px-2 py-1 text-[11px] font-semibold text-pool ring-1 ring-pool/25">
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

export type MoveTargetCategory = { id: string | null; name: string };

export type CategoryCardProps = {
  category: { id: string | null; name: string; order: number };
  isOwner: boolean;
  isPublicView: boolean;
  canReorder: boolean;
  isItemReorderMode: boolean;
  isCategoryReorderMode: boolean;
  isCollapsed: boolean;
  isCategoryDropHighlighted: boolean;
  dragState: 'idle' | 'dragging-item' | 'dragging-category';
  itemsForCategory: WishlistItem[];
  itemIds: string[];
  optimisticCategories: WishlistCategory[];
  moveTargets: MoveTargetCategory[];
  onToggleCollapse: () => void;
  onOpenQuickAdd: (categoryId: string | null) => void;
  onMoveItemByOffset: (itemId: string, delta: -1 | 1) => void;
  onMoveItemToCategory: (itemId: string, categoryId: string | null) => void;
  onStatusChange: (itemId: string, status: WishlistItemStatusValue) => void;
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
  Pick<
    CategoryCardProps,
    | 'canReorder'
    | 'category'
    | 'dragState'
    | 'itemIds'
    | 'itemsForCategory'
    | 'moveTargets'
    | 'onMoveItemByOffset'
    | 'onMoveItemToCategory'
  >
>;
type WishlistCategoryBodyProps = Readonly<
  Pick<
    CategoryCardProps,
    | 'canReorder'
    | 'category'
    | 'dragState'
    | 'isCollapsed'
    | 'isItemReorderMode'
    | 'isOwner'
    | 'isPublicView'
    | 'itemIds'
    | 'itemsForCategory'
    | 'moveTargets'
    | 'onMoveItemByOffset'
    | 'onMoveItemToCategory'
    | 'onStatusChange'
    | 'optimisticCategories'
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
    | 'isCategoryReorderMode'
    | 'isItemReorderMode'
    | 'isOwner'
    | 'isCollapsed'
    | 'itemsForCategory'
    | 'onOpenQuickAdd'
    | 'onToggleCollapse'
  >
>;

export function CategoryItemsGrid({
  dragState,
  isOwner,
  isPublicView,
  itemsForCategory,
  onStatusChange,
  optimisticCategories,
}: CategoryItemsGridProps) {
  // Single-column list of full-width rows. Previously this was a
  // 1/2/3/4-column CSS grid, which forced every row to match the tallest
  // card's height — image cards stretched text cards into a ragged layout
  // with faked mask-image fades to hide the excess whitespace. Rows give
  // us uniform height with no stretch, no wasted space, and identical
  // layout on mobile and desktop.
  return (
    <div className="flex flex-col gap-2">
      {itemsForCategory.map((item) => (
        <WishlistItemComponent
          key={item.id}
          wishlistItem={item}
          isOwner={isOwner}
          categories={optimisticCategories}
          disableClaims={isPublicView || item.type === 'wishlist'}
          isReorderMode={false}
          dragState={dragState}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

function MoveToCategoryMenu({
  itemTitle,
  otherCategories,
  onSelect,
}: {
  itemTitle: string;
  otherCategories: MoveTargetCategory[];
  onSelect: (categoryId: string | null) => void;
}) {
  if (otherCategories.length === 0) return null;

  return (
    <WishlistRowActionsMenu label={`Move ${itemTitle} to another category`}>
      {otherCategories.map((target) => (
        <WishlistRowActionsItem
          key={target.id ?? 'default'}
          onSelect={() => onSelect(target.id)}
        >
          <LuFolderInput className="h-4 w-4 text-muted-foreground" aria-hidden />
          {target.name}
        </WishlistRowActionsItem>
      ))}
    </WishlistRowActionsMenu>
  );
}

type ReorderItemRowProps = Readonly<{
  canMoveDown: boolean;
  canMoveUp: boolean;
  canReorder: boolean;
  dragState: 'idle' | 'dragging-item' | 'dragging-category';
  item: WishlistItem;
  otherCategories: MoveTargetCategory[];
  onMoveItemByOffset: (itemId: string, delta: -1 | 1) => void;
  onMoveItemToCategory: (itemId: string, categoryId: string | null) => void;
}>;

function ReorderItemRow({
  canMoveDown,
  canMoveUp,
  canReorder,
  dragState,
  item,
  otherCategories,
  onMoveItemByOffset,
  onMoveItemToCategory,
}: ReorderItemRowProps) {
  return (
    <SortableShell key={item.id} id={toItemDragId(item.id)} disabled={!canReorder}>
      {({ attributes, listeners, setActivatorNodeRef, isDragging }) => (
        <div
          data-testid="wishlist-item-row"
          data-drag-state={dragState}
          data-drop-target="false"
          className={`flex items-center gap-2 rounded-xl border border-border/80 bg-card px-2 py-2 shadow-sm transition sm:gap-3 sm:px-3 ${
            isDragging ? 'border-pool/40 bg-pool/10 ring-2 ring-pool/40' : ''
          }`}
        >
          <DragHandle
            label={`Drag item ${item.title}`}
            active={isDragging}
            attributes={attributes}
            listeners={listeners}
            setActivatorNodeRef={setActivatorNodeRef}
          />
          <Text weight="medium" className="min-w-0 flex-1 truncate">
            {item.title}
          </Text>
          <MoveByOffsetButtons
            label={item.title}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMove={(delta) => onMoveItemByOffset(item.id, delta)}
          />
          <MoveToCategoryMenu
            itemTitle={item.title}
            otherCategories={otherCategories}
            onSelect={(categoryId) => onMoveItemToCategory(item.id, categoryId)}
          />
        </div>
      )}
    </SortableShell>
  );
}

export function CategoryReorderBody({
  canReorder,
  category,
  dragState,
  itemIds,
  itemsForCategory,
  moveTargets,
  onMoveItemByOffset,
  onMoveItemToCategory,
}: CategoryReorderBodyProps) {
  const otherCategories = moveTargets.filter(
    (target) => target.id !== category.id,
  );

  return (
    <SortableContext
      items={itemIds.map((itemId) => toItemDragId(itemId))}
      strategy={rectSortingStrategy}
    >
      <div className="space-y-2">
        {itemsForCategory.map((item, index) => (
          <ReorderItemRow
            key={item.id}
            canMoveUp={canReorder && index > 0}
            canMoveDown={canReorder && index < itemsForCategory.length - 1}
            canReorder={canReorder}
            dragState={dragState}
            item={item}
            otherCategories={otherCategories}
            onMoveItemByOffset={onMoveItemByOffset}
            onMoveItemToCategory={onMoveItemToCategory}
          />
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
  category,
  dragState,
  isCollapsed,
  isItemReorderMode,
  isOwner,
  isPublicView,
  itemIds,
  itemsForCategory,
  moveTargets,
  onMoveItemByOffset,
  onMoveItemToCategory,
  onStatusChange,
  optimisticCategories,
}: WishlistCategoryBodyProps) {
  // Reorder mode always shows items regardless of the collapsed flag.
  const isOpen = !isCollapsed || isItemReorderMode;

  // Height animation without measuring content: outer grid container
  // transitions `grid-template-rows` from 0fr → 1fr, inner `min-h-0 overflow-hidden`
  // lets the row collapse all the way to zero. Guarded with `motion-safe:`
  // so prefers-reduced-motion users still get an instant toggle.
  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out',
        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pb-1 pt-2">
          {isItemReorderMode ? (
            <CategoryReorderBody
              canReorder={canReorder}
              category={category}
              dragState={dragState}
              itemIds={itemIds}
              itemsForCategory={itemsForCategory}
              moveTargets={moveTargets}
              onMoveItemByOffset={onMoveItemByOffset}
              onMoveItemToCategory={onMoveItemToCategory}
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
      </div>
    </div>
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

// Category grouping is a SECTION, not a card: heading + divider + spacing.
// Cards are reserved for the items themselves (distinct interactive objects).
function CategoryHeader({
  category,
  isCategoryReorderMode,
  isCollapsed,
  isItemReorderMode,
  isOwner,
  itemsForCategory,
  onOpenQuickAdd,
  onToggleCollapse,
}: CategoryHeaderProps) {
  const canToggleCollapse = !isItemReorderMode && !isCategoryReorderMode;
  const titleContent = (
    <>
      {!isItemReorderMode ? (
        <Icon
          name={isCollapsed ? 'chevron-right' : 'chevron-down'}
          className="h-4 w-4"
        />
      ) : null}
      <CategoryTitle category={category} count={itemsForCategory.length} />
    </>
  );

  return (
    <div className="flex min-h-12 items-center justify-between gap-2 border-b border-border/60">
      {canToggleCollapse ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-md py-2 pr-2 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapse}
        >
          {titleContent}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2">
          {titleContent}
        </div>
      )}

      {isOwner && !isItemReorderMode && !isCategoryReorderMode ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Add item to ${category.name}`}
          className="h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={() => onOpenQuickAdd(category.id ?? null)}
        >
          <LuPlus className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
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
  isCategoryDropHighlighted,
  dragState,
  itemsForCategory,
  itemIds,
  optimisticCategories,
  moveTargets,
  onToggleCollapse,
  onOpenQuickAdd,
  onMoveItemByOffset,
  onMoveItemToCategory,
  onStatusChange,
}: CategoryCardProps) => {
  const categoryKey = category.id ?? 'default';

  return (
    <section
      className={`${dragState === 'dragging-item' && !isCategoryDropHighlighted
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
          category={category}
          isCategoryReorderMode={isCategoryReorderMode}
          isCollapsed={isCollapsed}
          isItemReorderMode={isItemReorderMode}
          isOwner={isOwner}
          itemsForCategory={itemsForCategory}
          onOpenQuickAdd={onOpenQuickAdd}
          onToggleCollapse={onToggleCollapse}
        />
      </HeaderDropTarget>
      <WishlistCategoryBody
        canReorder={canReorder}
        category={category}
        dragState={dragState}
        isCollapsed={isCollapsed}
        isItemReorderMode={isItemReorderMode}
        isOwner={isOwner}
        isPublicView={isPublicView}
        itemIds={itemIds}
        itemsForCategory={itemsForCategory}
        moveTargets={moveTargets}
        onMoveItemByOffset={onMoveItemByOffset}
        onMoveItemToCategory={onMoveItemToCategory}
        onStatusChange={onStatusChange}
        optimisticCategories={optimisticCategories}
      />
    </section>
  );
};
