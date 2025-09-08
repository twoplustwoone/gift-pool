import {
  type User,
  type UserImage,
  type WishlistItem as WishlistItemType,
} from '@prisma/client'
import { Link, useFetcher, useRevalidator } from '@remix-run/react'
import { useEffect, useState } from 'react'

import { Button } from '#app/components/ui/button'
import { ConfirmDialog } from '#app/components/ui/confirm-dialog'
import { Icon } from '#app/components/ui/icon'
import { Input } from '#app/components/ui/input'
import { WishlistItemEditor } from '#app/routes/wishlist+/__wishlist-item-editor'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { useToast } from '#app/components/toaster.tsx'
import { Grid, Stack } from '../ui-kit'
import { CategoryManager } from './category-manager'
import { WishlistItem } from './wishlist-item'

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
  const displayName = user.name ?? user.username
  const categories = [
    { id: null, name: 'Default (Uncategorized)', order: -1 },
    ...user.wishlistCategories,
  ]

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const actionFetcher = useFetcher()
  const revalidator = useRevalidator()

  useToast((actionFetcher.data as any)?.toast)

  useEffect(() => {
    if (actionFetcher.state === 'idle' && (actionFetcher.data as any)?.ok) {
      revalidator.revalidate()
      setEditingId(null)
    }
  }, [actionFetcher.state, actionFetcher.data, revalidator])

  const toggle = (id: string | null) => {
    setCollapsed((prev) => ({ ...prev, [id ?? 'default']: !prev[id ?? 'default'] }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 py-4 sm:px-8 sm:pt-8">
        <div className="flex flex-col items-center justify-between gap-2 lg:flex-row">
          <Link
            to={`/users/${user.username}`}
            className="flex flex-col items-center justify-center gap-2 lg:flex-row lg:justify-start lg:gap-4"
          >
            <img
              src={getUserImgSrc(user.image?.id)}
              alt={displayName}
              className="h-12 w-12 rounded-full object-cover lg:h-16 lg:w-16"
            />
            <h1 className="text-center text-lg font-bold lg:text-left">
              {displayName}'s Wishlist
            </h1>
          </Link>
          {isOwner && (
            <div className="flex gap-2">
              <WishlistItemEditor categories={user.wishlistCategories} />
              <CategoryManager categories={user.wishlistCategories} />
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-bottom-nav sm:pb-0">
        <Stack gap={4}>
          {categories.map((category) => {
            const items = user.wishlistItems.filter(
              (item) => item.categoryId === category.id,
            )
            const key = category.id ?? 'default'
            const isCollapsed = collapsed[key]
            return (
              <div
                key={key}
                className="rounded-xl border border-border bg-background"
              >
                <div
                  className="flex items-center justify-between rounded-t-xl bg-muted px-4 py-2 hover:bg-muted/80"
                  onClick={() => toggle(category.id)}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                      className="h-4 w-4"
                    />
                    {editingId === category.id ? (
                      <actionFetcher.Form
                        method="post"
                        action="/wishlist/categories"
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input type="hidden" name="intent" value="rename" />
                        <input type="hidden" name="id" value={category.id ?? ''} />
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
                          <Icon name="check" className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Cancel"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(null)
                          }}
                        >
                          <Icon name="x" className="h-4 w-4" />
                        </Button>
                      </actionFetcher.Form>
                    ) : (
                      <h2 className="text-sm font-semibold">
                        {category.name} ({items.length})
                      </h2>
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
                            + Item
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
                            <Icon name="pencil" className="h-4 w-4" />
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
                              <Icon name="trash" className="h-4 w-4" />
                            </Button>
                          </ConfirmDialog>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="p-4">
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
            )
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
