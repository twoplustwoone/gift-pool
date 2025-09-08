import { useFetcher } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { FaPencilAlt, FaPlus, FaTimes } from 'react-icons/fa';
import { FaCheck, FaGear } from 'react-icons/fa6';
import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import { Icon } from '#app/components/ui/icon';
import { Input } from '#app/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#app/components/ui/popover';
import { Flex, Text } from '../ui-kit';

export type WishlistCategory = { id: string; name: string; order: number };

export const CategoryManager = ({
  categories,
}: {
  categories: WishlistCategory[];
}) => {
  const [open, setOpen] = useState(false);
  const createFetcher = useFetcher();
  const actionFetcher = useFetcher();
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
        <Button type="button" variant="outline">
          <Flex gap={1.5}>
            <FaGear />
            <Text size="sm">Add Category</Text>
          </Flex>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-4" align="end">
        <h3 className="text-sm font-semibold">Manage Categories</h3>
        <createFetcher.Form
          ref={formRef}
          method="post"
          action="/wishlist/categories"
          className="flex gap-2"
        >
          <input type="hidden" name="intent" value="create" />
          <Input
            name="name"
            placeholder="Category name"
            className="h-8 flex-1"
          />
          <Button type="submit" size="icon" aria-label="Create category">
            <FaPlus />
          </Button>
        </createFetcher.Form>
        <ul className="flex flex-col gap-2">
          <li className="flex items-center justify-between text-sm text-muted-foreground">
            Default (Uncategorized) <span className="text-xs">(Default)</span>
          </li>
          {categories.map((cat, index) => (
            <li key={cat.id} className="flex items-center gap-2">
              {editingId === cat.id ? (
                <actionFetcher.Form
                  method="post"
                  action="/wishlist/categories"
                  className="flex flex-1 items-center gap-2"
                >
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="id" value={cat.id} />
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
                      <FaCheck />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel"
                      onClick={() => setEditingId(null)}
                    >
                      <FaTimes className="h-4 w-4" />
                    </Button>
                  </Flex>
                </actionFetcher.Form>
              ) : (
                <>
                  <span className="flex-1">{cat.name}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() =>
                      actionFetcher.submit(
                        { intent: 'move', id: cat.id, direction: 'up' },
                        { method: 'post', action: '/wishlist/categories' },
                      )
                    }
                  >
                    <Icon name="chevron-up" className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={index === categories.length - 1}
                    onClick={() =>
                      actionFetcher.submit(
                        { intent: 'move', id: cat.id, direction: 'down' },
                        { method: 'post', action: '/wishlist/categories' },
                      )
                    }
                  >
                    <Icon name="chevron-down" className="h-4 w-4" />
                  </Button>
                  <Flex>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit category"
                      onClick={() => setEditingId(cat.id)}
                    >
                      <FaPencilAlt />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Delete category"
                      onClick={() =>
                        actionFetcher.submit(
                          { intent: 'delete', id: cat.id },
                          { method: 'post', action: '/wishlist/categories' },
                        )
                      }
                    >
                      <Icon name="trash" className="h-4 w-4" />
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
