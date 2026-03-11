import {
  DndContext,
  type DraggableAttributes,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type User,
  type UserImage,
  type WishlistItem as WishlistItemType,
} from '@prisma/client';
import {
  Link,
  useFetcher,
  useFetchers,
  useNavigation,
  useSearchParams,
} from 'react-router';
import {
  type FormEvent,
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LuCheck,
  LuArchive,
  LuArrowUpDown,
  LuGripVertical,
  LuLink,
  LuPlus,
  LuPencil,
  LuShare2,
  LuTrash,
  LuX,
} from 'react-icons/lu';
import { toast } from 'sonner';

import { useToast } from '#app/components/toaster.tsx';
import { Badge } from '#app/components/ui/badge';
import { Button } from '#app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#app/components/ui/dialog';
import { Icon } from '#app/components/ui/icon';
import { Input } from '#app/components/ui/input';
import {
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetDescription,
  MobileBottomSheetHeader,
  MobileBottomSheetTitle,
  MobileBottomSheetTrigger,
} from '#app/components/ui/mobile-bottom-sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#app/components/ui/tooltip';
import {
  WishlistItemEditor,
  type WishlistItemEditorHandle,
} from '#app/routes/wishlist+/__wishlist-item-editor';
import { type action as shareAction } from '#app/routes/wishlist+/share';
import { track } from '#app/utils/analytics.client.ts';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { useOptionalRequestInfo } from '#app/utils/request-info.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import {
  isWishlistItemActive,
  type WishlistItemStatusValue,
} from '#app/utils/wishlist.ts';
import { Card } from '../ui/card.tsx';
import { Heading } from '../ui/heading.tsx';
import { Flex, Grid, Stack, Text } from '../ui-kit';
import { CategoryManager } from './category-manager';
import {
  applyPendingCategoryMutations,
  applySettledCategoryMutations,
  pruneSatisfiedSettledCategoryMutations,
  type CategoryMutationResult,
  type PendingCategoryMutation,
  type WishlistCategory,
} from './wishlist-category-state';
import { WishlistItem } from './wishlist-item';
import {
  WishlistRowActionsItem,
  WishlistRowActionsMenu,
} from './wishlist-row-actions';

export type WishlistUser = Pick<User, 'id' | 'username' | 'name'> & {
  image: Pick<UserImage, 'id'> | null;
  wishlistItems: (Pick<
    WishlistItemType,
    | 'id'
    | 'title'
    | 'ownerId'
    | 'note'
    | 'url'
    | 'type'
    | 'categoryId'
    | 'sortOrder'
    | 'updatedAt'
    | 'status'
  > & {
    updatedAt: Date;
    status: WishlistItemStatusValue;
    purchase?: { purchasedById: string } | null;
    hasImage?: boolean;
    imageSource?: WishlistItemImageSource | null;
  })[];
  wishlistCategories: WishlistCategory[];
};

type WishlistPublicShare = { token: string; createdAt: Date };

const useIsDesktop = () => {
  const getMatches = () => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return false;
    return window.matchMedia('(min-width: 640px)').matches;
  };

  const [isDesktop, setIsDesktop] = useState(getMatches);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mediaQuery = window.matchMedia('(min-width: 640px)');

    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
};

const WishlistAvatar = ({
  isOwner,
  user,
}: {
  isOwner: boolean;
  user: Pick<WishlistUser, 'username' | 'name' | 'image'>;
}) => {
  const displayName = user.name ?? user.username;
  const image = (
    <img
      src={getUserImgSrc(user.image?.id)}
      alt={displayName}
      className="h-10 w-10 rounded-full object-cover"
    />
  );

  if (isOwner) {
    return image;
  }
  return (
    <Link
      to={`/users/${user.username}`}
      className="group flex items-center gap-3 hover:no-underline"
    >
      {image}
    </Link>
  );
};

const DEFAULT_CATEGORY_KEY = 'default';
const CATEGORY_DRAG_PREFIX = 'category:';
const ITEM_DRAG_PREFIX = 'item:';
const CATEGORY_DROP_PREFIX = 'category-drop:';
type ReorderMode = 'off' | 'items' | 'categories';
type SortableListeners = ReturnType<typeof useSortable>['listeners'];
type WishlistStatusMutationResponse = {
  ok: boolean;
  status?: WishlistItemStatusValue;
  error?: string;
  clientMutationId?: string | null;
};
type WishlistReorderMutationResponse = {
  ok: boolean;
  error?: string;
  clientMutationId?: string | null;
};
type PendingStatusMutation = {
  itemId: string;
  previousStatus: WishlistItemStatusValue;
  nextStatus: WishlistItemStatusValue;
  clientMutationId: string;
};
type PendingReorderMutation = {
  clientMutationId: string;
  previousItems: WishlistUser['wishlistItems'];
  previousCategories: WishlistCategory[];
};

const categoryKeyFromId = (categoryId: string | null) =>
  categoryId ?? DEFAULT_CATEGORY_KEY;
const categoryIdFromKey = (key: string) =>
  key === DEFAULT_CATEGORY_KEY ? null : key;

const toCategoryDragId = (categoryId: string) =>
  `${CATEGORY_DRAG_PREFIX}${categoryId}`;
const toItemDragId = (itemId: string) => `${ITEM_DRAG_PREFIX}${itemId}`;
const toCategoryDropId = (categoryKey: string) =>
  `${CATEGORY_DROP_PREFIX}${categoryKey}`;

const getCategoryIdFromDragId = (dragId: string) =>
  dragId.startsWith(CATEGORY_DRAG_PREFIX)
    ? dragId.slice(CATEGORY_DRAG_PREFIX.length)
    : null;
const getItemIdFromDragId = (dragId: string) =>
  dragId.startsWith(ITEM_DRAG_PREFIX)
    ? dragId.slice(ITEM_DRAG_PREFIX.length)
    : null;
const getCategoryKeyFromDropId = (dropId: string) =>
  dropId.startsWith(CATEGORY_DROP_PREFIX)
    ? dropId.slice(CATEGORY_DROP_PREFIX.length)
    : null;

const compareItemsBySortOrder = (
  a: WishlistUser['wishlistItems'][number],
  b: WishlistUser['wishlistItems'][number],
) =>
  a.sortOrder - b.sortOrder ||
  a.updatedAt.getTime() - b.updatedAt.getTime() ||
  a.id.localeCompare(b.id);

const reorderItemIdsInList = ({
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

const moveItemIdBetweenLists = ({
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

const cloneItemsSnapshot = (items: WishlistUser['wishlistItems']) =>
  items.map((item) => ({ ...item }));
const cloneCategoriesSnapshot = (categories: WishlistCategory[]) =>
  categories.map((category) => ({ ...category }));

const applyCategoryItemOrder = ({
  prevItems,
  categoryId,
  orderedIds,
}: {
  prevItems: WishlistUser['wishlistItems'];
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

type PendingItemMutation =
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

const normalizeFormActionPath = (action: string | null | undefined) => {
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

const getFormString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value : null;
};

const normalizeNullableFormValue = (value: string | null) => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const getNextSortOrder = (
  items: WishlistUser['wishlistItems'],
  categoryId: string | null,
) => {
  const max = items
    .filter((item) => item.categoryId === categoryId)
    .reduce((currentMax, item) => Math.max(currentMax, item.sortOrder), -1);
  return max + 1;
};

const redensifyCategorySortOrder = (
  items: WishlistUser['wishlistItems'],
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

const applyPendingItemMutations = ({
  items,
  pendingMutations,
  ownerId,
}: {
  items: WishlistUser['wishlistItems'];
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
    className={`inline-flex h-10 w-10 touch-none items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground active:scale-[0.98] ${
      active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''
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
      className={`relative rounded-xl transition ${
        isActiveTarget
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

const SortableShell = ({
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
  const [items, setItems] = useState(() =>
    [...user.wishlistItems].sort(compareItemsBySortOrder),
  );
  const [orderedCategories, setOrderedCategories] = useState(() =>
    [...user.wishlistCategories].sort((a, b) => a.order - b.order),
  );
  const [educationSeen, setEducationSeen] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRemovalRef = useRef<{
    itemId: string;
    prevIndex: number;
    toastId?: string | number;
    timestamp: number;
  } | null>(null);
  const statusUpdateFetcher = useFetcher<WishlistStatusMutationResponse>();
  const actionFetcher = useFetcher();
  const pendingFetchers = useFetchers();
  const navigation = useNavigation();
  const reorderFetcher = useFetcher<WishlistReorderMutationResponse>();
  const [settledCategoryMutations, setSettledCategoryMutations] = useState<
    Map<string, CategoryMutationResult>
  >(new Map());
  const pendingStatusMutationRef = useRef<PendingStatusMutation | null>(null);
  const pendingReorderMutationRef = useRef<PendingReorderMutation | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [reorderMode, setReorderMode] = useState<ReorderMode>('off');
  const [dragging, setDragging] = useState<{
    type: 'category' | 'item';
    dragId: string;
  } | null>(null);
  const [itemDropTargetCategoryKey, setItemDropTargetCategoryKey] = useState<
    string | null
  >(null);
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<string | null>(
    null,
  );
  const quickAddEditorRef = useRef<WishlistItemEditorHandle>(null);

  const pendingCategoryMutations = useMemo<PendingCategoryMutation[]>(() => {
    return pendingFetchers.reduce<PendingCategoryMutation[]>(
      (mutations, fetcher, index) => {
        if (!fetcher.formData) return mutations;
        if (
          normalizeFormActionPath(fetcher.formAction) !== '/wishlist/categories'
        ) {
          return mutations;
        }

        const intent = getFormString(fetcher.formData, 'intent');
        const clientMutationId =
          normalizeNullableFormValue(
            getFormString(fetcher.formData, 'clientMutationId'),
          ) ?? `fetcher-category-${index}`;

        if (intent === 'create') {
          const name = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'name'),
          );
          if (!name) return mutations;
          mutations.push({
            type: 'create',
            clientMutationId,
            name,
            order: orderedCategories.length,
          });
          return mutations;
        }

        if (intent === 'rename') {
          const categoryId = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'id'),
          );
          const name = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'name'),
          );
          if (!categoryId || !name) return mutations;
          mutations.push({
            type: 'rename',
            clientMutationId,
            categoryId,
            name,
          });
          return mutations;
        }

        if (intent === 'delete') {
          const categoryId = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'id'),
          );
          if (!categoryId) return mutations;
          mutations.push({
            type: 'delete',
            clientMutationId,
            categoryId,
          });
          return mutations;
        }

        return mutations;
      },
      [],
    );
  }, [orderedCategories.length, pendingFetchers]);

  const settledCategoryMutationList = useMemo(
    () => [...settledCategoryMutations.values()],
    [settledCategoryMutations],
  );

  const optimisticCategories = useMemo(
    () =>
      applyPendingCategoryMutations({
        categories: applySettledCategoryMutations({
          categories: orderedCategories,
          settledMutations: settledCategoryMutationList,
        }),
        pendingMutations: pendingCategoryMutations,
      }),
    [orderedCategories, pendingCategoryMutations, settledCategoryMutationList],
  );

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
            status: existingItem?.status ?? 'ACTIVE',
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
        ownerId: user.id,
      }),
    [items, pendingItemMutations, user.id],
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

  useEffect(() => {
    if (statusUpdateFetcher.state !== 'idle') {
      return;
    }
    setItems([...user.wishlistItems].sort(compareItemsBySortOrder));
  }, [statusUpdateFetcher.state, user.wishlistItems]);

  useEffect(() => {
    const nextServerCategories = [...user.wishlistCategories].sort(
      (a, b) => a.order - b.order,
    );
    setOrderedCategories(nextServerCategories);
    setSettledCategoryMutations((currentMutations) => {
      const nextMutations = pruneSatisfiedSettledCategoryMutations({
        serverCategories: nextServerCategories,
        settledMutations: [...currentMutations.values()],
      });
      return new Map(
        nextMutations.map((mutation) => [mutation.clientMutationId!, mutation]),
      );
    });
  }, [user.wishlistCategories]);

  useEffect(() => {
    const paramsView =
      searchParams.get('view') === 'past'
        ? ('past' as const)
        : ('wishlist' as const);
    setView(paramsView);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen =
      window.localStorage.getItem(`past_items_edu_seen_${user.id}`) === '1';
    setEducationSeen(seen);
  }, [user.id]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const markEducationSeen = () => {
    setEducationSeen(true);
    setShowEducation(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`past_items_edu_seen_${user.id}`, '1');
    }
  };

  const handleViewChange = (next: 'wishlist' | 'past') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'past') {
      params.set('view', 'past');
    } else {
      params.delete('view');
    }
    setSearchParams(params, { replace: true });
    setView(next);
  };

  const hasDefaultItems = activeItems.some((item) => item.categoryId === null);
  const categories = [
    { id: null, name: 'Default (Uncategorized)', order: -1 },
    ...optimisticCategories,
  ].filter((category) => {
    if (category.id !== null) return true;
    if (isOwner) return true;
    return hasDefaultItems;
  });

  useToast((actionFetcher.data as any)?.toast);

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
  }, [reorderFetcher.data, reorderFetcher.state]);

  const toggle = (id: string | null) => {
    setCollapsed((prev) => ({
      ...prev,
      [id ?? 'default']: !prev[id ?? 'default'],
    }));
  };

  const handleCategoryMutationResult = useCallback(
    (result: CategoryMutationResult) => {
      if (!result.ok || !result.clientMutationId) return;
      const mutationId = result.clientMutationId;

      const affectedCategoryId =
        result.category?.id ?? result.deletedCategoryId;
      setSettledCategoryMutations((previousMutations) => {
        const nextMutations = new Map<string, CategoryMutationResult>();

        for (const [clientMutationId, previousResult] of previousMutations) {
          const previousAffectedCategoryId =
            previousResult.category?.id ?? previousResult.deletedCategoryId;
          if (
            affectedCategoryId &&
            previousAffectedCategoryId === affectedCategoryId
          ) {
            continue;
          }

          nextMutations.set(clientMutationId, previousResult);
        }

        nextMutations.set(mutationId, result);
        return nextMutations;
      });
    },
    [],
  );

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const clearRemovalState = useCallback(
    (itemId: string) => {
      if (lastRemovalRef.current?.itemId !== itemId) return;
      if (lastRemovalRef.current?.toastId) {
        toast.dismiss(lastRemovalRef.current.toastId);
      }
      lastRemovalRef.current = null;
      clearUndoTimer();
    },
    [clearUndoTimer],
  );

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

  const rollbackStatusMutation = useCallback(
    (mutation: PendingStatusMutation, errorMessage?: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === mutation.itemId
            ? { ...item, status: mutation.previousStatus }
            : item,
        ),
      );

      if (
        mutation.nextStatus === 'ARCHIVED' &&
        mutation.previousStatus !== 'ARCHIVED'
      ) {
        clearRemovalState(mutation.itemId);
        setShowEducation(false);
      }

      toast.error('Unable to update wishlist item', {
        description: errorMessage ?? 'Please try again.',
      });
    },
    [clearRemovalState],
  );

  const submitStatusUpdate = ({
    itemId,
    previousStatus,
    status,
  }: {
    itemId: string;
    previousStatus: WishlistItemStatusValue;
    status: WishlistItemStatusValue;
  }) => {
    const clientMutationId = createClientMutationId();
    pendingStatusMutationRef.current = {
      itemId,
      previousStatus,
      nextStatus: status,
      clientMutationId,
    };

    const formData = new FormData();
    formData.set('intent', 'update-wishlist-item-status');
    formData.set('wishlistItemId', itemId);
    formData.set('status', status);
    formData.set('clientMutationId', clientMutationId);
    void statusUpdateFetcher.submit(formData, {
      method: 'post',
      action: '/wishlist/status',
    });
  };

  useEffect(() => {
    if (statusUpdateFetcher.state !== 'idle') return;
    const pendingMutation = pendingStatusMutationRef.current;
    if (!pendingMutation) return;

    const actionData = statusUpdateFetcher.data;
    if (
      actionData?.clientMutationId &&
      actionData.clientMutationId !== pendingMutation.clientMutationId
    ) {
      return;
    }
    pendingStatusMutationRef.current = null;

    if (actionData?.ok) {
      const confirmedStatus = actionData.status ?? pendingMutation.nextStatus;
      if (confirmedStatus !== pendingMutation.nextStatus) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === pendingMutation.itemId
              ? { ...item, status: confirmedStatus }
              : item,
          ),
        );
      }
      return;
    }

    rollbackStatusMutation(pendingMutation, actionData?.error);
  }, [
    rollbackStatusMutation,
    statusUpdateFetcher.data,
    statusUpdateFetcher.state,
  ]);

  const handleUndo = () => {
    const removal = lastRemovalRef.current;
    if (!removal) return;
    clearUndoTimer();
    setItems((prev) =>
      prev.map((item) =>
        item.id === removal.itemId ? { ...item, status: 'ACTIVE' } : item,
      ),
    );
    submitStatusUpdate({
      itemId: removal.itemId,
      previousStatus: 'ARCHIVED',
      status: 'ACTIVE',
    });
    if (removal.toastId) {
      toast.dismiss(removal.toastId);
    }
    toast.success('Restored to wishlist', { duration: 2000 });
    track('wishlist_item_undo_clicked', {
      itemId: removal.itemId,
      wishlistId: user.id,
      reason: 'previously_wanted',
      position_before: removal.prevIndex,
      timestamp: Date.now(),
    });
    handleViewChange('wishlist');
    if (showEducation) {
      markEducationSeen();
    }
    lastRemovalRef.current = null;
  };

  const handleStatusChange = (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => {
    let previousStatus: WishlistItemStatusValue | null = null;
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === itemId);
      if (index === -1) return prev;
      const prevItem = prev[index];
      if (!prevItem) return prev;
      previousStatus = prevItem.status;
      const next = [...prev];
      next[index] = { ...prevItem, status };

      if (status === 'ARCHIVED' && prevItem.status !== 'ARCHIVED') {
        const removalInfo = {
          itemId,
          prevIndex: index,
          timestamp: Date.now(),
        };
        track('wishlist_item_removed', {
          itemId,
          wishlistId: user.id,
          reason: 'previously_wanted',
          position_before: index,
          timestamp: removalInfo.timestamp,
        });
        if (!educationSeen) {
          setShowEducation(true);
          setEducationSeen(true);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(`past_items_edu_seen_${user.id}`, '1');
          }
        }
        if (lastRemovalRef.current?.toastId) {
          toast.dismiss(lastRemovalRef.current.toastId);
        }
        clearUndoTimer();
        const toastId = toast('Moved to Past items', {
          id: 'wishlist-remove',
          description: 'Undo available.',
          duration: 6000,
          position: 'bottom-center',
          action: {
            label: 'Undo',
            onClick: handleUndo,
          },
        });
        lastRemovalRef.current = { ...removalInfo, toastId };
        undoTimerRef.current = setTimeout(() => {
          track('wishlist_item_undo_timeout', {
            itemId: removalInfo.itemId,
            wishlistId: user.id,
            reason: 'previously_wanted',
            position_before: removalInfo.prevIndex,
            timestamp: Date.now(),
          });
          lastRemovalRef.current = null;
        }, 6000);
      }

      if (status === 'ACTIVE' && prevItem.status !== 'ACTIVE') {
        if (lastRemovalRef.current?.toastId) {
          toast.dismiss(lastRemovalRef.current.toastId);
        }
        clearUndoTimer();
        lastRemovalRef.current = null;
      }

      return next;
    });

    submitStatusUpdate({
      itemId,
      previousStatus: previousStatus ?? 'ACTIVE',
      status,
    });
    return false;
  };

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

  const openQuickAdd = (categoryId: string | null) => {
    setQuickAddCategoryId(categoryId);
    requestAnimationFrame(() => {
      quickAddEditorRef.current?.openCreate();
    });
  };
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
  const activeItemId =
    dragging?.type === 'item' ? getItemIdFromDragId(dragging.dragId) : null;
  const activeItemCategoryKey = activeItemId
    ? categoryKeyFromId(itemById.get(activeItemId)?.categoryId ?? null)
    : null;

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
    previousItems: WishlistUser['wishlistItems'];
    previousCategories: { id: string; name: string; order: number }[];
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
    void reorderFetcher.submit(formData, {
      method: 'post',
      action: '/wishlist/reorder',
    });
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
    previousItems: WishlistUser['wishlistItems'];
    previousCategories: { id: string; name: string; order: number }[];
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
    void reorderFetcher.submit(formData, {
      method: 'post',
      action: '/wishlist/reorder',
    });
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

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeDragId = String(active.id);
    const overDragId = over ? String(over.id) : null;

    if (!overDragId) {
      handleDragCancel();
      return;
    }

    if (reorderMode === 'categories' && dragging?.type === 'category') {
      const activeCategoryId = getCategoryIdFromDragId(activeDragId);
      const overCategoryId = getCategoryIdFromDragId(overDragId);
      if (
        !activeCategoryId ||
        !overCategoryId ||
        activeCategoryId === overCategoryId
      ) {
        handleDragCancel();
        return;
      }

      const oldIndex = customCategoryIds.indexOf(activeCategoryId);
      const newIndex = customCategoryIds.indexOf(overCategoryId);
      if (oldIndex === -1 || newIndex === -1) {
        handleDragCancel();
        return;
      }

      const nextCategoryIds = arrayMove(customCategoryIds, oldIndex, newIndex);
      const previousItems = items;
      const previousCategories = orderedCategories;
      const nextCategories = nextCategoryIds
        .map((id, order) => {
          const category = orderedCategories.find((entry) => entry.id === id);
          if (!category) return null;
          return { ...category, order };
        })
        .filter(Boolean) as typeof orderedCategories;

      setOrderedCategories(nextCategories);
      submitCategoryReorder({
        ids: nextCategoryIds,
        previousItems,
        previousCategories,
      });
      handleDragCancel();
      return;
    }

    if (reorderMode !== 'items' || dragging?.type !== 'item') {
      handleDragCancel();
      return;
    }

    const movedItemId = getItemIdFromDragId(activeDragId);
    if (!movedItemId) {
      handleDragCancel();
      return;
    }

    const movedItem = itemById.get(movedItemId);
    if (!movedItem) {
      handleDragCancel();
      return;
    }

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

    if (!targetCategoryKey) {
      handleDragCancel();
      return;
    }

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

      handleDragCancel();
      return;
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

    handleDragCancel();
  };

  const dragState: 'idle' | 'dragging-item' | 'dragging-category' =
    dragging?.type === 'category'
      ? 'dragging-category'
      : dragging?.type === 'item'
        ? 'dragging-item'
        : 'idle';
  const defaultCategory =
    categories.find((category) => category.id === null) ?? null;
  const customCategories = categories.filter(
    (category): category is { id: string; name: string; order: number } =>
      category.id !== null,
  );

  const renderCategoryCard = ({
    category,
    categoryHandle,
  }: {
    category: { id: string | null; name: string; order: number };
    categoryHandle?: {
      attributes: DraggableAttributes;
      listeners: SortableListeners;
      setActivatorNodeRef: (element: HTMLElement | null) => void;
      isDragging: boolean;
    };
  }) => {
    const categoryKey = categoryKeyFromId(category.id);
    const itemIds = itemIdsByCategoryKey[categoryKey] ?? [];
    const itemsForCategory = itemIds
      .map((itemId) => itemById.get(itemId))
      .filter(Boolean) as WishlistUser['wishlistItems'];
    const isCollapsed = isItemReorderMode
      ? false
      : Boolean(collapsed[categoryKey]);
    const isEditing =
      category.id !== null &&
      editingId === category.id &&
      !isCategoryReorderMode &&
      !isItemReorderMode;
    const isCategoryDropHighlighted =
      isItemReorderMode &&
      itemDropTargetCategoryKey === categoryKey &&
      activeItemCategoryKey !== categoryKey;

    const categoryBody =
      !isCollapsed || isItemReorderMode ? (
        <div className="border-t border-card-border p-3 sm:p-4">
          {isItemReorderMode ? (
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
          ) : (
            <Grid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} gap={3}>
              {itemsForCategory.map((item) => (
                <WishlistItem
                  key={item.id}
                  wishlistItem={item}
                  isOwner={isOwner}
                  categories={optimisticCategories}
                  disableClaims={isPublicView}
                  layout="default"
                  isReorderMode={false}
                  dragState={dragState}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </Grid>
          )}
        </div>
      ) : null;

    const categoryActions =
      isOwner && !isItemReorderMode && !isCategoryReorderMode ? (
        <WishlistRowActionsMenu label={`Category actions for ${category.name}`}>
          <WishlistRowActionsItem
            onSelect={() => openQuickAdd(category.id ?? null)}
          >
            <LuPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
            Add item
          </WishlistRowActionsItem>
          {canReorder ? (
            <WishlistRowActionsItem onSelect={startItemReorderMode}>
              <LuArrowUpDown
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              Reorder items
            </WishlistRowActionsItem>
          ) : null}
          {canReorder ? (
            <WishlistRowActionsItem onSelect={startCategoryReorderMode}>
              <LuArrowUpDown
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              Reorder categories
            </WishlistRowActionsItem>
          ) : null}
          {category.id ? (
            <WishlistRowActionsItem onSelect={() => setEditingId(category.id!)}>
              <LuPencil className="h-4 w-4 text-muted-foreground" aria-hidden />
              Rename category
            </WishlistRowActionsItem>
          ) : null}
          {category.id ? (
            <WishlistRowActionsItem
              className="text-red-600 focus:text-red-700"
              onSelect={() =>
                setPendingDeleteCategory({
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
      ) : null;

    return (
      <div
        className={`group overflow-hidden rounded-xl border border-border/90 bg-surface shadow-sm transition ${
          dragState === 'dragging-item' && !isCategoryDropHighlighted
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
          <div
            className={`flex min-h-14 items-center justify-between gap-2 rounded-t-xl bg-surface px-3 py-2 sm:px-4 ${
              isItemReorderMode ? '' : 'cursor-pointer hover:bg-muted'
            }`}
            onClick={() => {
              if (isItemReorderMode || isCategoryReorderMode) return;
              toggle(category.id);
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              {!isItemReorderMode ? (
                <Icon
                  name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                  className="h-4 w-4"
                />
              ) : null}
              {isEditing ? (
                <actionFetcher.Form
                  method="post"
                  action="/wishlist/categories"
                  className="flex items-center gap-2"
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={attachClientMutationIdToForm}
                >
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="id" value={category.id ?? ''} />
                  <input type="hidden" name="clientMutationId" value="" />
                  <Input
                    name="name"
                    defaultValue={category.name}
                    className="h-8"
                  />
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
                      setEditingId(null);
                    }}
                  >
                    <LuX />
                  </Button>
                </actionFetcher.Form>
              ) : (
                <Heading>
                  <Flex align="center" gap={2}>
                    <Text weight="bold" className="truncate">
                      {category.name}
                    </Text>
                    <Text
                      className="text-muted-foreground"
                      size="xs"
                      weight="bold"
                    >
                      ({itemsForCategory.length})
                    </Text>
                  </Flex>
                </Heading>
              )}
            </div>

            <div
              className="flex items-center gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              {categoryHandle ? (
                <DragHandle
                  label={`Drag category ${category.name}`}
                  active={Boolean(categoryHandle.isDragging)}
                  attributes={categoryHandle.attributes}
                  listeners={categoryHandle.listeners}
                  setActivatorNodeRef={categoryHandle.setActivatorNodeRef}
                />
              ) : null}
              {categoryActions}
            </div>
          </div>
        </HeaderDropTarget>
        {categoryBody}
      </div>
    );
  };

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
              className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${
                view === 'wishlist'
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
              className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${
                view === 'past'
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
                className={`space-y-4 ${
                  isOwner && !isReorderMode
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
                                <DragHandle
                                  label={`Drag category ${category.name}`}
                                  active={isDragging}
                                  attributes={attributes}
                                  listeners={listeners}
                                  setActivatorNodeRef={setActivatorNodeRef}
                                />
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
                    {defaultCategory
                      ? renderCategoryCard({ category: defaultCategory })
                      : null}
                    <div className="space-y-4">
                      {customCategories.map((category) => (
                        <Fragment key={category.id}>
                          {renderCategoryCard({
                            category,
                          })}
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

const WishlistHeader = ({
  isOwner,
  user,
  displayName,
  origin,
  publicShare,
  isPublicView,
  hideOwnerControls,
  hideFloatingAddButton,
  onStartItemReorder,
  onStartCategoryReorder,
  onCategoryMutationResult,
}: {
  isOwner: boolean;
  user: Pick<
    {
      name: string | null;
      username: string;
    },
    'name' | 'username'
  > & {
    image: Pick<UserImage, 'id'> | null;
    wishlistCategories: WishlistCategory[];
  };
  displayName: string;
  origin?: string;
  publicShare: WishlistPublicShare | null;
  isPublicView: boolean;
  hideOwnerControls: boolean;
  hideFloatingAddButton: boolean;
  onStartItemReorder: () => void;
  onStartCategoryReorder: () => void;
  onCategoryMutationResult: (result: CategoryMutationResult) => void;
}) => (
  <div className="w-full border-b bg-surface">
    <div className="mx-auto flex min-h-11 w-full max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <WishlistAvatar isOwner={isOwner} user={user} />
        <div className="flex min-w-0 items-center gap-2">
          {isOwner ? (
            <Text size="xl" weight="bold" className="truncate">
              My Wishlist
            </Text>
          ) : (
            <div className="flex min-w-0 flex-col items-start">
              <Text
                size="xl"
                weight="bold"
                className="w-full truncate group-hover:underline"
              >
                {displayName}'s Wishlist
              </Text>
              <Text size="xs" className="w-full truncate text-muted-foreground">
                @{user.username}
              </Text>
            </div>
          )}
          <div className="shrink-0">
            {isOwner ? (
              <WishlistShareDialog
                username={user.username}
                displayName={displayName}
                origin={origin}
                publicShare={publicShare}
              />
            ) : (
              <WishlistLinkCopyButton
                displayName={displayName}
                username={user.username}
                isPublicView={isPublicView}
                origin={origin}
              />
            )}
          </div>
        </div>
      </div>

      {isOwner && !hideOwnerControls ? (
        <div className="flex shrink-0 gap-2">
          <WishlistItemEditor
            categories={user.wishlistCategories}
            hideFloatingTrigger={hideFloatingAddButton}
          />
          <CategoryManager
            categories={user.wishlistCategories}
            compact
            onStartItemReorder={onStartItemReorder}
            onStartCategoryReorder={onStartCategoryReorder}
            onMutationResult={onCategoryMutationResult}
          />
        </div>
      ) : null}
    </div>
  </div>
);

const WishlistShareDialog = ({
  username,
  displayName,
  origin,
  publicShare,
}: {
  username: string;
  displayName: string;
  origin?: string;
  publicShare: WishlistPublicShare | null;
}) => {
  const requestInfo = useOptionalRequestInfo();
  const shareFetcher = useFetcher<typeof shareAction>();
  useToast((shareFetcher.data as any)?.toast);

  const [open, setOpen] = useState(false);
  const [activeShare, setActiveShare] = useState<WishlistPublicShare | null>(
    publicShare,
  );
  const [copiedType, setCopiedType] = useState<'private' | 'public' | null>(
    null,
  );
  const publicLinkRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActiveShare(publicShare);
  }, [publicShare]);

  useEffect(() => {
    const incomingShare = (shareFetcher.data as any)?.publicShare;
    if (incomingShare !== undefined) {
      setActiveShare(
        incomingShare
          ? {
              ...incomingShare,
              createdAt: new Date(incomingShare.createdAt),
            }
          : null,
      );
    }
  }, [shareFetcher.data]);

  const hasLoadedShare = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (hasLoadedShare.current) return;
    if (publicShare || shareFetcher.data) {
      hasLoadedShare.current = true;
      return;
    }
    hasLoadedShare.current = true;
    void shareFetcher.load('/wishlist/share');
  }, [open, publicShare, shareFetcher, shareFetcher.data]);

  useEffect(() => {
    if (!activeShare) return;
    if (!publicLinkRef.current) return;
    publicLinkRef.current.focus();
    publicLinkRef.current.select();
  }, [activeShare]);

  const resolvedOrigin =
    origin ??
    requestInfo?.origin ??
    (typeof window !== 'undefined' ? window.location.origin : '');

  const privateLink = resolvedOrigin
    ? new URL(`/users/${username}/wishlist`, resolvedOrigin).toString()
    : `/users/${username}/wishlist`;
  const publicLink =
    activeShare && resolvedOrigin
      ? new URL(`/w/public/${activeShare.token}`, resolvedOrigin).toString()
      : activeShare
        ? `/w/public/${activeShare.token}`
        : '';
  const isPending = shareFetcher.state !== 'idle';

  const copyLink = async (link: string, type: 'private' | 'public') => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedType(type);
      toast.success(
        type === 'private' ? 'Private link copied' : 'Public link copied',
        {
          description:
            type === 'private'
              ? 'Login required to view.'
              : 'Anyone with the link can view.',
        },
      );
      setTimeout(() => setCopiedType(null), 1500);
    } catch {
      toast.error('Unable to copy link');
    }
  };

  const generatePublicLink = () =>
    void shareFetcher.submit(
      { intent: 'generate-public-link' },
      { method: 'post', action: '/wishlist/share' },
    );

  const revokePublicLink = () =>
    void shareFetcher.submit(
      { intent: 'revoke-public-link' },
      { method: 'post', action: '/wishlist/share' },
    );

  const statusLabel = activeShare ? 'On' : 'Off';
  const hasPublicLink = Boolean(activeShare);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const isDesktop = useIsDesktop();

  const triggerButton = (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Share wishlist"
      data-state={open ? 'open' : 'closed'}
    >
      {open ? (
        <LuCheck className="h-5 w-5" />
      ) : (
        <LuShare2 className="h-5 w-5" />
      )}
    </Button>
  );

  const shareBody = (
    <>
      <Stack gap={4}>
        <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                Private link (requires login)
              </p>
              <p className="text-xs text-muted-foreground">
                Anyone you share this with must log in.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => copyLink(privateLink, 'private')}
            >
              {copiedType === 'private' ? 'Copied' : 'Copy private link'}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Public link (no login)</p>
              <Badge
                variant={hasPublicLink ? 'pool' : 'default'}
                className={
                  hasPublicLink ? '' : 'bg-muted text-muted-foreground'
                }
              >
                {statusLabel}
              </Badge>
            </div>
            {hasPublicLink ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyLink(publicLink, 'public')}
                >
                  {copiedType === 'public' ? 'Copied' : 'Copy public link'}
                </Button>
                {confirmingRevoke ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmingRevoke(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        revokePublicLink();
                        setConfirmingRevoke(false);
                      }}
                    >
                      Revoke link
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setConfirmingRevoke(true)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Anyone with this link can view your wishlist. No login required.
          </p>

          {hasPublicLink ? (
            <div className="mt-3 space-y-2">
              <Input
                ref={publicLinkRef}
                readOnly
                value={publicLink}
                onClick={(event) => event.currentTarget.select()}
              />
              <p className="text-[11px] text-muted-foreground">
                Revoking disables this link immediately. Are you sure?
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Only share with people you trust. Anyone with the link can view.
              </div>
              <Button
                type="button"
                onClick={generatePublicLink}
                disabled={isPending}
                className="w-full sm:w-auto"
              >
                Generate public link
              </Button>
            </div>
          )}
        </div>
      </Stack>

      <p className="text-[11px] text-muted-foreground">
        Sharing as {displayName} (@{username})
      </p>
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>{triggerButton}</DialogTrigger>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Share wishlist</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share wishlist</DialogTitle>
            <DialogDescription>
              Send a private link for friends or a public view-only link.
            </DialogDescription>
          </DialogHeader>
          {shareBody}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <MobileBottomSheet open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <MobileBottomSheetTrigger asChild>
              {triggerButton}
            </MobileBottomSheetTrigger>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Share wishlist</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <MobileBottomSheetContent className="sm:max-w-lg">
        <MobileBottomSheetHeader>
          <MobileBottomSheetTitle>Share wishlist</MobileBottomSheetTitle>
          <MobileBottomSheetDescription>
            Send a private link for friends or a public view-only link.
          </MobileBottomSheetDescription>
        </MobileBottomSheetHeader>
        {shareBody}
      </MobileBottomSheetContent>
    </MobileBottomSheet>
  );
};

const WishlistLinkCopyButton = ({
  username,
  displayName,
  isPublicView,
  origin,
}: {
  username: string;
  displayName: string;
  isPublicView: boolean;
  origin?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copyLink = async () => {
    const base =
      origin ??
      (typeof window !== 'undefined' ? window.location.origin : undefined);
    const path = isPublicView
      ? window.location.pathname + window.location.search
      : `/users/${username}/wishlist`;
    const shareUrl = base ? new URL(path, base).toString() : path;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const ariaLabel = copied
    ? 'Wishlist link copied'
    : isPublicView
      ? 'Copy public wishlist link'
      : `Copy ${displayName}'s wishlist link`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={ariaLabel}
            onClick={copyLink}
          >
            {copied ? (
              <LuCheck className="h-5 w-5" />
            ) : (
              <LuLink className="h-5 w-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          {copied
            ? 'Link copied'
            : isPublicView
              ? 'Copy public link'
              : 'Copy wishlist link'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const PastEducationCallout = ({
  onViewPast,
  onDismissEducation,
}: {
  onViewPast: () => void;
  onDismissEducation: () => void;
}) => (
  <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-col gap-1">
      <Text weight="bold">Item moved to Past items</Text>
      <Text className="text-muted-foreground">
        When you remove something from your wishlist, it’s saved here so you can
        remember what you wanted — and others can get inspiration.
      </Text>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="secondary" onClick={onViewPast}>
        View Past items
      </Button>
      <Button variant="ghost" onClick={onDismissEducation}>
        Got it
      </Button>
    </div>
  </div>
);

const PastWishlistItems = ({
  items,
  isOwner,
  categories,
  showEducation,
  onDismissEducation,
  onViewPast,
  onStatusChange,
}: {
  items: WishlistUser['wishlistItems'];
  isOwner: boolean;
  categories: { id: string; name: string; order: number }[];
  showEducation: boolean;
  onDismissEducation: () => void;
  onViewPast: () => void;
  onStatusChange: (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => boolean | void;
}) => {
  const sortedItems = [...items].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-card-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <LuArchive className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="flex flex-col">
            <Heading>Past items</Heading>
            <Text size="sm" className="text-muted-foreground">
              Items you received or removed stay here
            </Text>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="space-y-3 border-t border-card-border p-4">
        {showEducation ? (
          <PastEducationCallout
            onDismissEducation={onDismissEducation}
            onViewPast={onViewPast}
          />
        ) : null}

        {sortedItems.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
            <Text weight="bold">Your past wishlist items live here</Text>
            <Text className="text-muted-foreground">
              Items you’ve received or removed stay here for reference and
              inspiration.
            </Text>
          </div>
        ) : (
          <Grid columns={{ sm: 2, md: 3, lg: 4 }} gap={4}>
            {sortedItems.map((item) => (
              <PastWishlistItemCard
                key={`${item.id}-${item.updatedAt.getTime()}`}
                item={item}
                isOwner={isOwner}
                categories={categories}
                onStatusChange={onStatusChange}
              />
            ))}
          </Grid>
        )}
      </div>
    </div>
  );
};

const PastWishlistItemCard = ({
  item,
  isOwner,
  categories,
  onStatusChange,
}: {
  item: WishlistUser['wishlistItems'][number];
  isOwner: boolean;
  categories: { id: string; name: string; order: number }[];
  onStatusChange: (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => boolean | void;
}) => {
  return (
    <WishlistItemEditor
      wishlistItem={{
        id: item.id,
        title: item.title,
        url: item.url ?? null,
        note: item.note ?? null,
        type: item.type,
        categoryId: item.categoryId ?? null,
        hasImage: item.hasImage ?? false,
        imageSource: item.imageSource ?? null,
        updatedAt: item.updatedAt,
        status: item.status as WishlistItemStatusValue,
      }}
      categories={categories}
      canEdit={isOwner}
      initialMode="view"
      onStatusChange={onStatusChange}
      trigger={
        <Card
          variant="interactive"
          padding="md"
          className="group h-full cursor-pointer"
        >
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Text
                  size="base"
                  weight="medium"
                  className="block truncate"
                  aria-label={item.title}
                >
                  {item.title}
                </Text>
                <Text
                  size="xs"
                  className="line-clamp-2 text-muted-foreground"
                  aria-label={item.note ?? 'No description'}
                >
                  {item.note ?? 'No description'}
                </Text>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                Previously wanted
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span className="truncate">Saved for reference</span>
              <div className="flex items-center gap-1 text-primary">
                <LuArchive className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">View details</span>
                <span className="sm:hidden">View</span>
              </div>
            </div>
          </div>
        </Card>
      }
    />
  );
};
