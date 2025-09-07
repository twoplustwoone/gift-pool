import { useFetcher, useRevalidator } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '#app/components/ui/dialog';
import { Icon } from '#app/components/ui/icon';
import { Input } from '#app/components/ui/input';

export type WishlistCategory = { id: string; name: string; order: number };

export const CategoryManager = ({ categories }: { categories: WishlistCategory[] }) => {
  const [open, setOpen] = useState(false);
  const createFetcher = useFetcher();
  const actionFetcher = useFetcher();
  const revalidator = useRevalidator();
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useToast((createFetcher.data as any)?.toast ?? (actionFetcher.data as any)?.toast);

  useEffect(() => {
    if (
      (createFetcher.state === 'idle' && (createFetcher.data as any)?.ok) ||
      (actionFetcher.state === 'idle' && (actionFetcher.data as any)?.ok)
    ) {
      revalidator.revalidate();
      setEditingId(null);
      if ((createFetcher.data as any)?.ok) {
        formRef.current?.reset();
      }
    }
  }, [createFetcher.state, createFetcher.data, actionFetcher.state, actionFetcher.data, revalidator]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">Add Category</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <createFetcher.Form ref={formRef} method="post" action="/wishlist/categories" className="flex gap-2">
            <input type="hidden" name="intent" value="create" />
            <Input name="name" placeholder="Category name" className="flex-1" />
            <Button type="submit">Create</Button>
          </createFetcher.Form>
          <ul className="flex flex-col gap-2">
            <li className="flex items-center justify-between text-sm text-muted-foreground">
              Default (Uncategorized) <span className="text-xs">(Default)</span>
            </li>
            {categories.map((cat, index) => (
              <li key={cat.id} className="flex items-center gap-2">
                {editingId === cat.id ? (
                  <actionFetcher.Form method="post" action="/wishlist/categories" className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="intent" value="rename" />
                    <input type="hidden" name="id" value={cat.id} />
                    <Input name="name" defaultValue={cat.name} className="flex-1 h-8" />
                    <Button type="submit" size="icon" variant="ghost" aria-label="Save"><Icon name="check" className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditingId(null)}><Icon name="x" className="h-4 w-4" /></Button>
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
                        actionFetcher.submit({ intent: 'move', id: cat.id, direction: 'up' }, { method: 'post', action: '/wishlist/categories' })
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
                        actionFetcher.submit({ intent: 'move', id: cat.id, direction: 'down' }, { method: 'post', action: '/wishlist/categories' })
                      }
                    >
                      <Icon name="chevron-down" className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Edit"
                      onClick={() => setEditingId(cat.id)}
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Delete"
                      onClick={() =>
                        actionFetcher.submit({ intent: 'delete', id: cat.id }, { method: 'post', action: '/wishlist/categories' })
                      }
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="self-end">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
};
