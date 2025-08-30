import { Button } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx';
import { Link, useFetcher } from '@remix-run/react';
import React from 'react';

export const GroupActions = ({
  giftGroupId,
  canSettings,
  canLeave,
  canDelete,
}: {
  giftGroupId: string;
  canSettings: boolean;
  canLeave: boolean;
  canDelete: boolean;
}) => {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== 'idle';

  const submitIntent = (intent: string) => {
    const fd = new FormData();
    fd.set('giftGroupId', giftGroupId);
    fd.set('intent', intent);
    fetcher.submit(fd, { method: 'post', action: `/groups/${giftGroupId}` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="More actions">
          <Icon name="dots-horizontal" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuLabel>Group</DropdownMenuLabel>
        {canSettings && (
          <DropdownMenuItem asChild>
            <Link to={`/groups/${giftGroupId}/settings`}>
              <Icon name="pencil-1" /> Settings
            </Link>
          </DropdownMenuItem>
        )}
        {(canLeave || canDelete) && <DropdownMenuSeparator />}
        {canLeave && (
          <DropdownMenuItem
            disabled={submitting}
            onSelect={(e) => {
              e.preventDefault();
              submitIntent('leave-gift-group');
            }}
          >
            <Icon name="exit" /> Leave group
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            disabled={submitting}
            onSelect={(e) => {
              e.preventDefault();
              submitIntent('delete-gift-group');
            }}
          >
            <Icon name="trash" /> Delete group
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

