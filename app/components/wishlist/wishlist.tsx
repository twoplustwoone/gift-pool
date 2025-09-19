import {
  type User,
  type UserImage,
  type WishlistItem as WishlistItemType,
} from '@prisma/client';
import { Link, useFetcher } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';

import { LuCheck, LuPencil, LuPlus, LuTrash, LuX } from 'react-icons/lu';
import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog';
import { Icon } from '#app/components/ui/icon';
import { Input } from '#app/components/ui/input';
import { WishlistItemEditor } from '#app/routes/wishlist+/__wishlist-item-editor';
import { cn, getUserImgSrc } from '#app/utils/misc.tsx';
import { Heading } from '../ui/heading.tsx';
import { Flex, Grid, Stack, Text } from '../ui-kit';
import { CategoryManager } from './category-manager';
import { WishlistItem } from './wishlist-item';
 

export const Wishlist = ({
  user,
  isOwner,
}: {
  user: Pick<User, 'username' | 'name'> & {
    image: Pick<UserImage, 'id'> | null;
    wishlistItems: Pick<
      WishlistItemType,
      'id' | 'title' | 'ownerId' | 'note' | 'url' | 'type' | 'categoryId'
    >[];
    wishlistCategories: { id: string; name: string; order: number }[];
  };
  isOwner: boolean;
}) => {
  const displayName = user.name ?? user.username;
  const categories = [
    { id: null, name: 'Default (Uncategorized)', order: -1 },
    ...user.wishlistCategories,
  ];

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const actionFetcher = useFetcher();

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

  const toggle = (id: string | null) => {
    setCollapsed((prev) => ({
      ...prev,
      [id ?? 'default']: !prev[id ?? 'default'],
    }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-surface px-4 py-4">
        <div className="container flex flex-col items-center justify-between gap-2 lg:flex-row">
          {!isOwner ? (
            <Link
              to={`/users/${user.username}`}
              className="flex flex-col items-center justify-center gap-2 lg:flex-row lg:justify-start lg:gap-4"
            >
              <img
                src={getUserImgSrc(user.image?.id)}
                alt={displayName}
                className="h-6 w-6 rounded-full object-cover lg:h-10 lg:w-10"
              />
              <Text size="xl" weight="bold">
                {/* <h1 className="text-center text-lg font-bold lg:text-left"> */}
                {displayName}'s Wishlist
                {/* </h1> */}
              </Text>
            </Link>
          ) : (
            <>
              {/* <Text weight="bold"> */}
              <Text size="xl" weight="bold">
                My Wishlist
              </Text>
              <div className="flex gap-2">
                <WishlistItemEditor categories={user.wishlistCategories} />
                <CategoryManager categories={user.wishlistCategories} />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="container min-h-0 flex-1 py-8">
        <Stack gap={4}>
          {categories.map((category) => {
            const items = user.wishlistItems.filter(
              (item) => item.categoryId === category.id,
            );
            const key = category.id ?? 'default';
            const isCollapsed = collapsed[key];
            const isEditing = category.id !== null && editingId === category.id;
            return (
              <div
                key={key}
                className="group overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
              >
                <div
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-t-xl bg-surface px-4 py-2 hover:bg-muted',
                  )}
                  onClick={() => toggle(category.id)}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                      className="h-4 w-4"
                    />
                    {isEditing ? (
                      <actionFetcher.Form
                        method="post"
                        action="/wishlist/categories"
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input type="hidden" name="intent" value="rename" />
                        <input
                          type="hidden"
                          name="id"
                          value={category.id ?? ''}
                        />
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
                          onClick={(e) => e.stopPropagation()}
                        >
                          <LuCheck />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Cancel"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(null);
                          }}
                        >
                          <LuX />
                        </Button>
                      </actionFetcher.Form>
                    ) : (
                      <Heading>
                        <Flex align="center" gap={2}>
                          <Text weight="bold">{category.name}</Text>
                          <Text
                            className="text-muted-foreground"
                            size="xs"
                            weight="bold"
                          >
                            ({items.length})
                          </Text>
                        </Flex>
                      </Heading>
                    )}
                  </div>
                  {isOwner && (
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <WishlistItemEditor
                        categories={user.wishlistCategories}
                        defaultCategoryId={category.id ?? null}
                        trigger={
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Add item to ${category.name}`}
                          >
                            <Flex gap={1}>
                              <LuPlus size={12} />
                              <Text>Item</Text>
                            </Flex>
                          </Button>
                        }
                      />
                      {category.id && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Edit category"
                            onClick={() => setEditingId(category.id)}
                          >
                            <LuPencil />
                          </Button>
                          <ConfirmDialog
                            title="Delete category"
                            confirmText="Delete"
                            onConfirm={() =>
                              actionFetcher.submit(
                                { intent: 'delete', id: category.id },
                                {
                                  method: 'post',
                                  action: '/wishlist/categories',
                                },
                              )
                            }
                          >
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Delete category"
                            >
                              <LuTrash />
                            </Button>
                          </ConfirmDialog>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="border-t border-card-border p-4">
                    <Grid columns={{ sm: 2, md: 3, lg: 4 }} gap={4}>
                      {items.map((item) => (
                        <WishlistItem
                          key={item.id}
                          wishlistItem={item}
                          isOwner={isOwner}
                          categories={user.wishlistCategories}
                        />
                      ))}
                    </Grid>
                  </div>
                )}
              </div>
            );
          })}

          {user.wishlistItems.length === 0 ? (
            <div className="flex w-full flex-col items-center justify-center">
              {isOwner ? (
                <p className="text-center text-base text-slate-500">
                  Looks like you don't have any items in your wishlist yet! You
                  don't want stuff? Really?
                </p>
              ) : (
                <p className="text-center text-base text-slate-500">
                  {displayName} doesn't have any items in their wishlist yet!
                </p>
              )}
            </div>
          ) : null}
        </Stack>
      </div>
    </div>
  );
};
