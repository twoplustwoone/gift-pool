import {
  type User,
  type UserImage,
  type WishlistItem as WishlistItemType,
} from '@prisma/client';
import { Link, useFetcher, useSearchParams } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import {
  LuCheck,
  LuArchive,
  LuLink,
  LuPencil,
  LuPlus,
  LuShare2,
  LuTrash,
  LuX,
} from 'react-icons/lu';
import { toast } from 'sonner';

import { useToast } from '#app/components/toaster.tsx';
import { Badge } from '#app/components/ui/badge';
import { Button } from '#app/components/ui/button';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { WishlistItemEditor } from '#app/routes/wishlist+/__wishlist-item-editor';
import { type action as shareAction } from '#app/routes/wishlist+/share';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { useOptionalRequestInfo } from '#app/utils/request-info.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import {
  isWishlistItemActive,
  type WishlistItemStatusValue,
} from '#app/utils/wishlist.ts';
import { track } from '#app/utils/analytics.client.ts';
import { Card } from '../ui/card.tsx';
import { Heading } from '../ui/heading.tsx';
import { Flex, Grid, Stack, Text } from '../ui-kit';
import { CategoryManager } from './category-manager';
import { WishlistStatusBadge, getWishlistStatusMeta } from './status';
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
    | 'status'
  > & {
    updatedAt: Date;
    status: WishlistItemStatusValue;
    purchase?: { purchasedById: string } | null;
    hasImage?: boolean;
    imageSource?: WishlistItemImageSource | null;
  })[];
  wishlistCategories: { id: string; name: string; order: number }[];
};

type WishlistPublicShare = { token: string; createdAt: Date };

const useIsDesktop = () => {
  const getMatches = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
      return false;
    return window.matchMedia('(min-width: 640px)').matches;
  };

  const [isDesktop, setIsDesktop] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
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
    searchParams.get('view') === 'past' ? ('past' as const) : ('wishlist' as const);
  const [view, setView] = useState<'wishlist' | 'past'>(initialView);
  const [items, setItems] = useState(user.wishlistItems);
  const [educationSeen, setEducationSeen] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRemovalRef = useRef<{
    itemId: string;
    prevIndex: number;
    toastId?: string;
    timestamp: number;
  } | null>(null);
  const statusUpdateFetcher = useFetcher();
  const activeItems = items.filter((item) => isWishlistItemActive(item.status));
  const archivedItems = items.filter((item) => !isWishlistItemActive(item.status));

  useEffect(() => {
    setItems(user.wishlistItems);
  }, [user.wishlistItems]);

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
      window.localStorage.getItem(
        `past_items_edu_seen_${user.id}`,
      ) === '1';
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

  const clearUndoTimer = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const submitStatusUpdate = (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => {
    const formData = new FormData();
    formData.set('intent', 'update-wishlist-item-status');
    formData.set('wishlistItemId', itemId);
    formData.set('status', status);
    statusUpdateFetcher.submit(formData, {
      method: 'post',
      action: '/wishlist/status',
    });
  };

  const handleUndo = () => {
    const removal = lastRemovalRef.current;
    if (!removal) return;
    clearUndoTimer();
    setItems((prev) =>
      prev.map((item) =>
        item.id === removal.itemId ? { ...item, status: 'ACTIVE' } : item,
      ),
    );
    submitStatusUpdate(removal.itemId, 'ACTIVE');
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
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === itemId);
      if (index === -1) return prev;
      const prevItem = prev[index];
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
            window.localStorage.setItem(
              `past_items_edu_seen_${user.id}`,
              '1',
            );
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

    submitStatusUpdate(itemId, status);
    return false;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WishlistHeader
        isOwner={isOwner}
        user={user}
        displayName={displayName}
        origin={origin}
        publicShare={publicShare ?? null}
        isPublicView={isPublicView}
      />
      <div className="container min-h-0 flex-1 py-8">
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

          {view === 'wishlist' ? (
            <>
              {categories.map((category) => {
                const itemsForCategory = activeItems.filter(
                  (item) => item.categoryId === category.id,
                );
                const key = category.id ?? 'default';
                const isCollapsed = collapsed[key];
                const isEditing =
                  category.id !== null && editingId === category.id;
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
                                ({itemsForCategory.length})
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
                            onStatusChange={handleStatusChange}
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
                          {itemsForCategory.map((item) => (
                          <WishlistItem
                            key={item.id}
                            wishlistItem={item}
                            isOwner={isOwner}
                            categories={user.wishlistCategories}
                            disableClaims={isPublicView}
                            onStatusChange={handleStatusChange}
                          />
                          ))}
                        </Grid>
                      </div>
                    )}
                  </div>
                );
              })}

              {activeItems.length === 0 ? (
                <div className="flex w-full flex-col items-center justify-center">
                  {isOwner ? (
                    <p className="text-center text-base text-slate-500">
                      Looks like you don't have any items in your wishlist yet!
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
            </>
          ) : (
            <PastWishlistItems
              items={archivedItems}
              isOwner={isOwner}
              categories={user.wishlistCategories}
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
  origin?: string;
  publicShare: WishlistPublicShare | null;
  isPublicView: boolean;
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

      {isOwner ? (
        <div className="flex gap-2">
          <WishlistItemEditor categories={user.wishlistCategories} />
          <CategoryManager categories={user.wishlistCategories} />
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
  const [activeShare, setActiveShare] =
    useState<WishlistPublicShare | null>(publicShare);
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
    shareFetcher.load('/wishlist/share');
  }, [open, publicShare, shareFetcher, shareFetcher.data]);

  useEffect(() => {
    if (!activeShare) return;
    if (!publicLinkRef.current) return;
    publicLinkRef.current.focus();
    publicLinkRef.current.select();
  }, [activeShare?.token]);

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
    } catch (_error) {
      toast.error('Unable to copy link');
    }
  };

  const generatePublicLink = () =>
    shareFetcher.submit(
      { intent: 'generate-public-link' },
      { method: 'post', action: '/wishlist/share' },
    );

  const revokePublicLink = () =>
    shareFetcher.submit(
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
      {open ? <LuCheck className="h-5 w-5" /> : <LuShare2 className="h-5 w-5" />}
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
                className={hasPublicLink ? '' : 'bg-muted text-muted-foreground'}
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
  onStatusChange: (itemId: string, status: WishlistItemStatusValue) => boolean | void;
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
              Items you’ve received or removed stay here for reference and inspiration.
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
  onStatusChange: (itemId: string, status: WishlistItemStatusValue) => boolean | void;
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
