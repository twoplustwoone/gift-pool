import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuPencil, LuPlus, LuTrash, LuX } from 'react-icons/lu';
import { useFetcher } from 'react-router';

import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import { Input } from '#app/components/ui/input';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';

import { Flex, Text } from '../ui-kit';
import {
  DragHandle,
  MoveByOffsetButtons,
  SortableShell,
} from './wishlist-category-card';
import {
  type CategoryMutationResult,
  type WishlistCategory,
} from './wishlist-category-state';
import { DEFAULT_CATEGORY_KEY, toCategoryDragId } from './wishlist-item-state';

type OrganizeMode = 'items' | 'categories';

// Sticky mode banner shown while Organize mode is active. Explains the mode,
// switches between item and category organization, and exits.
export const OrganizeBanner = ({
  isCategoryReorderMode,
  isItemReorderMode,
  onDone,
  onModeChange,
}: {
  isCategoryReorderMode: boolean;
  isItemReorderMode: boolean;
  onDone: () => void;
  onModeChange: (mode: OrganizeMode) => void;
}) => (
  // The sticky offset has to clear the fixed top bar. This banner sticks to
  // the app's scroll container, whose scrollport starts at the very top of the
  // viewport — behind the header — so a bare `top-2` would park the banner
  // underneath it. The header's own height is the offset.
  <div className="sticky top-[calc(var(--top-bar-height)+0.5rem)] z-20 rounded-xl border border-pool/25 bg-pool/10 px-3 py-2 shadow-sm backdrop-blur">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <Text size="sm" weight="bold" className="text-pool">
          Organize
        </Text>
        <Text size="xs" className="text-pool/90">
          {isCategoryReorderMode
            ? 'Reorder, rename, or remove categories.'
            : 'Reorder items or move them between categories.'}
        </Text>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-full border border-pool/25 bg-background/80 p-1 text-xs">
          <button
            type="button"
            aria-label="Item reorder mode"
            aria-pressed={isItemReorderMode}
            className={`rounded-full px-3 py-1.5 font-semibold transition ${
              isItemReorderMode
                ? 'bg-pool text-pool-foreground shadow-sm'
                : 'text-pool hover:bg-pool/10'
            }`}
            onClick={() => onModeChange('items')}
          >
            Items
          </button>
          <button
            type="button"
            aria-label="Category reorder mode"
            aria-pressed={isCategoryReorderMode}
            className={`rounded-full px-3 py-1.5 font-semibold transition ${
              isCategoryReorderMode
                ? 'bg-pool text-pool-foreground shadow-sm'
                : 'text-pool hover:bg-pool/10'
            }`}
            onClick={() => onModeChange('categories')}
          >
            Categories
          </button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label="Done organizing"
          className="border border-pool/25"
          onClick={onDone}
        >
          Done
        </Button>
      </div>
    </div>
  </div>
);

const setClientMutationIdOnForm = (
  formElement: HTMLFormElement,
  mutationId: string,
) => {
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
};

type OrganizeCategoriesPanelProps = {
  customCategories: WishlistCategory[];
  defaultCategory: { id: null; name: string; order: number } | null;
  dragState: 'idle' | 'dragging-item' | 'dragging-category';
  itemIdsByCategoryKey: Record<string, string[]>;
  onMoveCategoryByOffset: (categoryId: string, delta: -1 | 1) => void;
  onMutationResult: (result: CategoryMutationResult) => void;
  onRequestDelete: (category: { id: string; name: string }) => void;
};

// Categories tab of Organize mode: create, rename, delete, and reorder
// (drag or up/down buttons) in one place. This absorbed the old header
// "Categories" popover so category management has a single explicit home.
export const OrganizeCategoriesPanel = ({
  customCategories,
  defaultCategory,
  dragState,
  itemIdsByCategoryKey,
  onMoveCategoryByOffset,
  onMutationResult,
  onRequestDelete,
}: OrganizeCategoriesPanelProps) => {
  const createFetcher = useFetcher();
  const renameFetcher = useFetcher();
  const [createName, setCreateName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const pendingCreateMutationIdRef = useRef<string | null>(null);
  const pendingCreateNameRef = useRef<string | null>(null);
  const pendingRenameMutationIdRef = useRef<string | null>(null);
  const handledCreateMutationIdRef = useRef<string | null>(null);
  const handledRenameMutationIdRef = useRef<string | null>(null);

  useToast(
    (createFetcher.data as any)?.toast ?? (renameFetcher.data as any)?.toast,
  );

  useEffect(() => {
    const createResult = createFetcher.data as
      CategoryMutationResult | undefined;
    const renameResult = renameFetcher.data as
      CategoryMutationResult | undefined;
    const createdOk =
      createResult?.ok &&
      createResult.clientMutationId != null &&
      createResult.clientMutationId === pendingCreateMutationIdRef.current;
    const renamedOk =
      renameResult?.ok &&
      renameResult.clientMutationId != null &&
      renameResult.clientMutationId === pendingRenameMutationIdRef.current;

    if (
      createdOk &&
      createResult &&
      handledCreateMutationIdRef.current !== createResult.clientMutationId
    ) {
      handledCreateMutationIdRef.current =
        createResult.clientMutationId ?? null;
      onMutationResult(createResult);
      pendingCreateMutationIdRef.current = null;
      if (createName.trim() === pendingCreateNameRef.current) {
        setCreateName('');
      }
      pendingCreateNameRef.current = null;
    }

    if (
      renamedOk &&
      renameResult &&
      handledRenameMutationIdRef.current !== renameResult.clientMutationId
    ) {
      handledRenameMutationIdRef.current =
        renameResult.clientMutationId ?? null;
      onMutationResult(renameResult);
      pendingRenameMutationIdRef.current = null;
      setEditingId(null);
    }
  }, [createFetcher.data, renameFetcher.data, onMutationResult, createName]);

  return (
    <div className="space-y-3">
      <createFetcher.Form
        method="post"
        action="/wishlist/categories"
        className="flex gap-2"
        onSubmit={(event) => {
          const mutationId = createClientMutationId();
          pendingCreateMutationIdRef.current = mutationId;
          setClientMutationIdOnForm(event.currentTarget, mutationId);
          pendingCreateNameRef.current = createName.trim();
        }}
      >
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="clientMutationId" value="" />
        <Input
          name="name"
          placeholder="Category name"
          className="h-10 flex-1"
          autoComplete="off"
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
        />
        <Button type="submit" aria-label="Add category">
          <LuPlus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline" aria-hidden>
            Add category
          </span>
        </Button>
      </createFetcher.Form>

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
        items={customCategories.map((category) =>
          toCategoryDragId(category.id),
        )}
        strategy={rectSortingStrategy}
      >
        {customCategories.map((category, index) => (
          <SortableShell key={category.id} id={toCategoryDragId(category.id)}>
            {({ attributes, listeners, setActivatorNodeRef, isDragging }) => (
              <div
                className={`rounded-xl border border-border/80 bg-surface px-2 py-2 shadow-sm transition sm:px-3 ${
                  isDragging
                    ? 'border-pool/40 bg-pool/10 ring-2 ring-pool/40'
                    : ''
                }`}
                data-testid="wishlist-category-row"
                data-drag-state={dragState}
                data-drop-target="false"
              >
                <div className="flex min-h-10 items-center gap-1 sm:gap-2">
                  <DragHandle
                    label={`Drag category ${category.name}`}
                    active={isDragging}
                    attributes={attributes}
                    listeners={listeners}
                    setActivatorNodeRef={setActivatorNodeRef}
                  />
                  {editingId === category.id ? (
                    <renameFetcher.Form
                      method="post"
                      action="/wishlist/categories"
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onSubmit={(event) => {
                        const mutationId = createClientMutationId();
                        pendingRenameMutationIdRef.current = mutationId;
                        setClientMutationIdOnForm(
                          event.currentTarget,
                          mutationId,
                        );
                      }}
                    >
                      <input type="hidden" name="intent" value="rename" />
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="clientMutationId" value="" />
                      <Input
                        name="name"
                        defaultValue={category.name}
                        className="h-9 flex-1"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        aria-label="Save category"
                      >
                        <LuCheck className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Cancel rename"
                        onClick={() => setEditingId(null)}
                      >
                        <LuX className="h-4 w-4" aria-hidden />
                      </Button>
                    </renameFetcher.Form>
                  ) : (
                    <>
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
                      <MoveByOffsetButtons
                        label={category.name}
                        canMoveUp={index > 0}
                        canMoveDown={index < customCategories.length - 1}
                        onMove={(delta) =>
                          onMoveCategoryByOffset(category.id, delta)
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Rename category ${category.name}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingId(category.id)}
                      >
                        <LuPencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete category ${category.name}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          onRequestDelete({
                            id: category.id,
                            name: category.name,
                          })
                        }
                      >
                        <LuTrash className="h-4 w-4" aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </SortableShell>
        ))}
      </SortableContext>
    </div>
  );
};
