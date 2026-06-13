import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuShare2 } from 'react-icons/lu';
import { useFetcher } from 'react-router';
import { toast } from 'sonner';

import { useToast } from '#app/components/toaster.tsx';
import { Badge } from '#app/components/ui/badge';
import { Button } from '#app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#app/components/ui/dialog';
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
import { type action as shareAction } from '#app/routes/wishlist+/share';
import { useOptionalRequestInfo } from '#app/utils/request-info.ts';

import { Stack } from '../ui-kit';
import { useIsDesktop } from './hooks/use-is-desktop';

type WishlistPublicShare = { token: string; createdAt: Date };

function toActiveShare(
  incomingShare: { token: string; createdAt: string } | null | undefined,
) {
  if (incomingShare === undefined) return undefined;
  return incomingShare
    ? {
        ...incomingShare,
        createdAt: new Date(incomingShare.createdAt),
      }
    : null;
}

function resolveWishlistLink(path: string, origin: string) {
  return origin ? new URL(path, origin).toString() : path;
}

function PrivateLinkCard({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Private link (requires login)</p>
          <p className="text-xs text-muted-foreground">
            Anyone you share this with must log in.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy private link'}
        </Button>
      </div>
    </div>
  );
}

function PublicLinkCard({
  confirmingRevoke,
  copied,
  hasPublicLink,
  isPending,
  onCancelRevoke,
  onConfirmRevoke,
  onCopy,
  onGenerate,
  onStartRevoke,
  publicLink,
  publicLinkRef,
}: {
  confirmingRevoke: boolean;
  copied: boolean;
  hasPublicLink: boolean;
  isPending: boolean;
  onCancelRevoke: () => void;
  onConfirmRevoke: () => void;
  onCopy: () => void;
  onGenerate: () => void;
  onStartRevoke: () => void;
  publicLink: string;
  publicLinkRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Public link (no login)</p>
          <Badge
            variant={hasPublicLink ? 'pool' : 'default'}
            className={hasPublicLink ? '' : 'bg-muted text-muted-foreground'}
          >
            {hasPublicLink ? 'On' : 'Off'}
          </Badge>
        </div>
        {hasPublicLink ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy public link'}
            </Button>
            {confirmingRevoke ? (
              <>
                <Button size="sm" variant="outline" onClick={onCancelRevoke}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onConfirmRevoke}
                >
                  Revoke link
                </Button>
              </>
            ) : (
              <Button size="sm" variant="destructive" onClick={onStartRevoke}>
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
          {confirmingRevoke ? (
            <p className="text-[11px] text-muted-foreground">
              Revoking disables this link immediately. Are you sure?
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Only share with people you trust. Anyone with the link can view.
          </div>
          <Button
            type="button"
            onClick={onGenerate}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Generate public link
          </Button>
        </div>
      )}
    </div>
  );
}

export const WishlistShareDialog = ({
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
    const nextActiveShare = toActiveShare((shareFetcher.data as any)?.publicShare);
    if (nextActiveShare !== undefined) {
      setActiveShare(nextActiveShare);
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
    Promise.resolve(shareFetcher.load('/wishlist/share')).catch(() => {});
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

  const privateLink = resolveWishlistLink(
    `/users/${username}/wishlist`,
    resolvedOrigin,
  );
  const publicLink =
    activeShare ?
      resolveWishlistLink(`/w/public/${activeShare.token}`, resolvedOrigin)
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

  const generatePublicLink = () => {
    Promise.resolve(
      shareFetcher.submit(
        { intent: 'generate-public-link' },
        { method: 'post', action: '/wishlist/share' },
      ),
    ).catch(() => {});
  };

  const revokePublicLink = () => {
    Promise.resolve(
      shareFetcher.submit(
        { intent: 'revoke-public-link' },
        { method: 'post', action: '/wishlist/share' },
      ),
    ).catch(() => {});
  };

  const hasPublicLink = Boolean(activeShare);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const isDesktop = useIsDesktop();
  const handleCopyPrivateLink = () => copyLink(privateLink, 'private');
  const handleCopyPublicLink = () => copyLink(publicLink, 'public');
  const handleStartRevoke = () => setConfirmingRevoke(true);
  const handleCancelRevoke = () => setConfirmingRevoke(false);
  const handleConfirmRevoke = () => {
    revokePublicLink();
    setConfirmingRevoke(false);
  };

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
        <PrivateLinkCard
          copied={copiedType === 'private'}
          onCopy={handleCopyPrivateLink}
        />
        <PublicLinkCard
          confirmingRevoke={confirmingRevoke}
          copied={copiedType === 'public'}
          hasPublicLink={hasPublicLink}
          isPending={isPending}
          onCancelRevoke={handleCancelRevoke}
          onConfirmRevoke={handleConfirmRevoke}
          onCopy={handleCopyPublicLink}
          onGenerate={generatePublicLink}
          onStartRevoke={handleStartRevoke}
          publicLink={publicLink}
          publicLinkRef={publicLinkRef}
        />
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
