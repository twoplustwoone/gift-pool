import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { toast } from 'sonner';

import { track } from '#app/utils/analytics.client.ts';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';
import  { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';

import {
  compareItemsBySortOrder,
  type PendingStatusMutation,
  type WishlistItem,
} from '../wishlist-item-state';

type WishlistStatusMutationResponse = {
  ok: boolean;
  status?: WishlistItemStatusValue;
  error?: string;
  clientMutationId?: string | null;
};

export const useWishlistStatusUpdate = ({
  serverItems,
  userId,
  onViewChange,
}: {
  serverItems: WishlistItem[];
  userId: string;
  onViewChange: (view: 'wishlist' | 'past') => void;
}) => {
  const [items, setItems] = useState<WishlistItem[]>(() =>
    [...serverItems].sort(compareItemsBySortOrder),
  );
  const [educationSeen, setEducationSeen] = useState(false);
  const [showEducation, setShowEducation] = useState(false);

  const statusUpdateFetcher = useFetcher<WishlistStatusMutationResponse>();
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRemovalRef = useRef<{
    itemId: string;
    prevIndex: number;
    toastId?: string | number;
    timestamp: number;
  } | null>(null);
  const pendingStatusMutationRef = useRef<PendingStatusMutation | null>(null);

  // Sync items from server when fetcher becomes idle
  useEffect(() => {
    if (statusUpdateFetcher.state !== 'idle') {
      return;
    }
    setItems([...serverItems].sort(compareItemsBySortOrder));
  }, [statusUpdateFetcher.state, serverItems]);

  // Load educationSeen from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen =
      window.localStorage.getItem(`past_items_edu_seen_${userId}`) === '1';
    setEducationSeen(seen);
  }, [userId]);

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

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

  // Handle status update response
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

  const markEducationSeen = useCallback(() => {
    setEducationSeen(true);
    setShowEducation(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`past_items_edu_seen_${userId}`, '1');
    }
  }, [userId]);

  const handleUndo = useCallback(() => {
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
      wishlistId: userId,
      reason: 'previously_wanted',
      position_before: removal.prevIndex,
      timestamp: Date.now(),
    });
    onViewChange('wishlist');
    if (showEducation) {
      markEducationSeen();
    }
    lastRemovalRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearUndoTimer, markEducationSeen, onViewChange, showEducation, userId]);

  const handleStatusChange = useCallback(
    (itemId: string, status: WishlistItemStatusValue) => {
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
            wishlistId: userId,
            reason: 'previously_wanted',
            position_before: index,
            timestamp: removalInfo.timestamp,
          });
          if (!educationSeen) {
            setShowEducation(true);
            setEducationSeen(true);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(
                `past_items_edu_seen_${userId}`,
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
              wishlistId: userId,
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearUndoTimer, educationSeen, handleUndo, userId],
  );

  return {
    items,
    setItems,
    showEducation,
    educationSeen,
    markEducationSeen,
    handleStatusChange,
    statusUpdateFetcherState: statusUpdateFetcher.state,
  };
};
