import React from 'react';
import { LuLogOut, LuPencil, LuTrash } from 'react-icons/lu';
import { Link, useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Flex } from '../ui-kit';

export const GroupActions = ({
  giftGroupId,
  canSettings,
  canLeave,
  canDelete,
  extraItems,
}: {
  giftGroupId: string;
  canSettings: boolean;
  canLeave: boolean;
  canDelete: boolean;
  extraItems?: React.ReactNode;
}) => {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== 'idle';

  const submitIntent = (intent: string) => {
    const fd = new FormData();
    fd.set('giftGroupId', giftGroupId);
    fd.set('intent', intent);
    void fetcher.submit(fd, {
      method: 'post',
      action: `/groups/${giftGroupId}`,
    });
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
              <Flex gap={2}>
                <LuPencil size={10} /> Settings
              </Flex>
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
            className="cursor-pointer"
          >
            <Flex gap={2}>
              <LuLogOut size={10} /> Leave group
            </Flex>
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            disabled={submitting}
            onSelect={(e) => {
              e.preventDefault();
              submitIntent('delete-gift-group');
            }}
            className="cursor-pointer"
          >
            <Flex gap={2}>
              <LuTrash size={10} /> Delete group
            </Flex>
          </DropdownMenuItem>
        )}
        {extraItems ? (
          <>
            <DropdownMenuSeparator />
            {extraItems}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
