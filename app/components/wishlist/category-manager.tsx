import { useFetcher } from '@remix-run/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  LuArrowUpDown,
  LuCheck,
  LuPencil,
  LuPlus,
  LuSettings,
  LuTrash,
  LuX,
} from 'react-icons/lu';
import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import { Input } from '#app/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#app/components/ui/popover';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';
import { Flex, Text } from '../ui-kit';

export type WishlistCategory = { id: string; name: string; order: number };

export const CategoryManager = ({
  categories,
  compact = false,
  onStartItemReorder,
  onStartCategoryReorder,
}: {
  categories: WishlistCategory[];
  compact?: boolean;
  onStartItemReorder?: () => void;
  onStartCategoryReorder?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const createFetcher = useFetcher();
  const actionFetcher = useFetcher();
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const attachClientMutationIdToForm = (event: FormEvent<HTMLFormElement>) => {
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
  };

  useToast(
    (createFetcher.data as any)?.toast ?? (actionFetcher.data as any)?.toast,
  );

  const handledRef = useRef(false);
  useEffect(() => {
    const createdOk = (createFetcher.data as any)?.ok;
    const actionOk = (actionFetcher.data as any)?.ok;
    const anyIdleOk =
      (createFetcher.state === 'idle' && createdOk) ||
      (actionFetcher.state === 'idle' && actionOk);

    if (anyIdleOk && !handledRef.current) {
      handledRef.current = true;
      setEditingId(null);
      if (createdOk) formRef.current?.reset();
    }

    if (createFetcher.state !== 'idle' || actionFetcher.state !== 'idle') {
      handledRef.current = false;
    }
  }, [
    createFetcher.state,
    createFetcher.data,
    actionFetcher.state,
    actionFetcher.data,
  ]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-xl"
            aria-label="Categories"
          >
            <LuSettings />
          </Button>
        ) : (
          <Button type="button" variant="outline" className="whitespace-nowrap">
            <Flex gap={1.5} className="items-center">
              <LuSettings />
              <Text size="sm">Categories</Text>
            </Flex>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-4" align="end">
        <h3 className="text-sm font-semibold">Manage Categories</h3>
        {onStartItemReorder || onStartCategoryReorder ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2">
            {onStartItemReorder ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 justify-start gap-2 rounded-lg"
                onClick={() => {
                  onStartItemReorder();
                  setOpen(false);
                }}
              >
                <LuArrowUpDown className="h-4 w-4" />
                Reorder items
              </Button>
            ) : null}
            {onStartCategoryReorder ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 justify-start gap-2 rounded-lg"
                onClick={() => {
                  onStartCategoryReorder();
                  setOpen(false);
                }}
              >
                <LuArrowUpDown className="h-4 w-4" />
                Reorder categories
              </Button>
            ) : null}
          </div>
        ) : null}
        <createFetcher.Form
          ref={formRef}
          method="post"
          action="/wishlist/categories"
          className="flex gap-2"
          onSubmit={attachClientMutationIdToForm}
        >
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="clientMutationId" value="" />
          <Input
            name="name"
            placeholder="Category name"
            className="h-8 flex-1"
            autoComplete="off"
          />
          <Button type="submit" size="icon" aria-label="Create category">
            <LuPlus />
          </Button>
        </createFetcher.Form>
        <ul className="flex flex-col gap-2">
          <li className="flex items-center justify-between text-sm text-muted-foreground">
            Default (Uncategorized) <span className="text-xs">(Default)</span>
          </li>
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center gap-2">
              {editingId === cat.id ? (
                <actionFetcher.Form
                  method="post"
                  action="/wishlist/categories"
                  className="flex flex-1 items-center gap-2"
                  onSubmit={attachClientMutationIdToForm}
                >
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="id" value={cat.id} />
                  <input type="hidden" name="clientMutationId" value="" />
                  <Input
                    name="name"
                    defaultValue={cat.name}
                    className="h-8 flex-1"
                  />
                  <Flex>
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      aria-label="Save"
                    >
                      <LuCheck />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel"
                      onClick={() => setEditingId(null)}
                    >
                      <LuX className="h-4 w-4" />
                    </Button>
                  </Flex>
                </actionFetcher.Form>
              ) : (
                <>
                  <span className="flex-1">{cat.name}</span>
                  <Flex>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit category"
                      onClick={() => setEditingId(cat.id)}
                    >
                      <LuPencil />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Delete category"
                      onClick={() =>
                        actionFetcher.submit(
                          {
                            intent: 'delete',
                            id: cat.id,
                            clientMutationId: createClientMutationId(),
                          },
                          { method: 'post', action: '/wishlist/categories' },
                        )
                      }
                    >
                      <LuTrash className="h-4 w-4" />
                    </Button>
                  </Flex>
                </>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
};
