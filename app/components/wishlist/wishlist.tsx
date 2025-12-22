import {
  type User,
  type UserImage,
  type WishlistItem as WishlistItemType,
} from '@prisma/client';
import { Link, useFetcher } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';

import { LuCheck, LuLink, LuPencil, LuPlus, LuTrash, LuX } from 'react-icons/lu';
import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog';
import { Icon } from '#app/components/ui/icon';
import { Input } from '#app/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#app/components/ui/tooltip';
import { WishlistItemEditor } from '#app/routes/wishlist+/__wishlist-item-editor';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import { Heading } from '../ui/heading.tsx';
import { Flex, Grid, Stack, Text } from '../ui-kit';
import { CategoryManager } from './category-manager';
import { WishlistItem } from './wishlist-item';

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
    | 'updatedAt'
  > & {
    updatedAt: Date;
    purchase?: { purchasedById: string } | null;
    hasImage?: boolean;
    imageSource?: WishlistItemImageSource | null;
  })[];
  wishlistCategories: { id: string; name: string; order: number }[];
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

export const Wishlist = ({
  user,
  isOwner,
}: {
  user: WishlistUser;
  isOwner: boolean;
}) => {
  const displayName = user.name ?? user.username;
  const hasDefaultItems = user.wishlistItems.some(
    (item) => item.categoryId === null,
  );
  const categories = [
    { id: null, name: 'Default (Uncategorized)', order: -1 },
    ...user.wishlistCategories,
  ].filter((category) => {
    if (category.id !== null) return true;
    if (isOwner) return true;
    return hasDefaultItems;
  });

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
      <WishlistHeader isOwner={isOwner} user={user} displayName={displayName} />
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
                  className="flex min-h-14 cursor-pointer items-center justify-between rounded-t-xl bg-surface px-4 py-2 hover:bg-muted"
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

const WishlistHeader = ({
  isOwner,
  user,
  displayName,
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
    wishlistCategories: { id: string; name: string; order: number }[];
  };
  displayName: string;
}) => (
  <div className="border-b bg-surface px-4 py-4">
    <div className="container flex min-h-11 items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <WishlistAvatar isOwner={isOwner} user={user} />
        <div className="flex items-center gap-2">
          {isOwner ? (
            <Text size="xl" weight="bold">
              My Wishlist
            </Text>
          ) : (
            <div className="flex flex-col items-start">
              <Text size="xl" weight="bold" className="group-hover:underline">
                {displayName}'s Wishlist
              </Text>
              <Text size="xs" className="text-muted-foreground">
                @{user.username}
              </Text>
            </div>
          )}
          <WishlistLinkCopyButton
            displayName={displayName}
            isOwner={isOwner}
            username={user.username}
          />
        </div>
      </div>

      {isOwner ? (
        <div className="flex gap-2">
          <WishlistItemEditor categories={user.wishlistCategories} />
          <CategoryManager categories={user.wishlistCategories} />
        </div>
      ) : null}
    </div>
  </div>
);

const WishlistLinkCopyButton = ({
  username,
  displayName,
  isOwner,
}: {
  username: string;
  displayName: string;
  isOwner: boolean;
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
    const shareUrl = new URL(
      `/users/${username}/wishlist`,
      window.location.origin,
    ).toString();
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const ariaLabel = copied
    ? 'Wishlist link copied'
    : isOwner
      ? 'Copy link to my wishlist'
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
          {copied ? 'Link copied' : 'Copy wishlist link'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
