import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuLink } from 'react-icons/lu';

import { Button } from '#app/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#app/components/ui/tooltip';

export const WishlistLinkCopyButton = ({
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
