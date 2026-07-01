import { type ReactNode, useState } from 'react';
import {
  LuEllipsisVertical,
  LuShieldCheck,
  LuShieldOff,
  LuUserMinus,
} from 'react-icons/lu';
import { useFetcher } from 'react-router';

import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx';
import {
  MobileBottomSheet,
  MobileBottomSheetClose,
  MobileBottomSheetContent,
  MobileBottomSheetDescription,
  MobileBottomSheetTitle,
  MobileBottomSheetTrigger,
} from '#app/components/ui/mobile-bottom-sheet.tsx';
import {
  type MemberMenuAction,
  memberMenuActions,
} from '#app/utils/group-member-menu.ts';
import { type GroupRole } from '#app/utils/group-role.ts';
import { cn } from '#app/utils/misc.tsx';
import { RoleBadge } from './RoleBadge.tsx';

type MenuMember = {
  user: {
    id: string;
    username: string;
    name: string | null;
    image: { id: string; altText: string | null } | null;
  };
  role: GroupRole;
};

const ACTION_META: Record<
  MemberMenuAction,
  {
    intent: string;
    label: string;
    icon: ReactNode;
    destructive: boolean;
    confirmTitle: (name: string) => string;
    confirmBody: (name: string) => string;
    confirmLabel: string;
  }
> = {
  promote: {
    intent: 'member-promote-admin',
    label: 'Promote to admin',
    icon: <LuShieldCheck className="h-4 w-4" aria-hidden />,
    destructive: false,
    confirmTitle: (name) => `Promote ${name} to admin?`,
    confirmBody: (name) =>
      `${name} will be able to manage members, invites, reminders, and group settings.`,
    confirmLabel: 'Promote',
  },
  demote: {
    intent: 'member-demote-member',
    label: 'Demote to member',
    icon: <LuShieldOff className="h-4 w-4" aria-hidden />,
    destructive: false,
    confirmTitle: (name) => `Demote ${name} to member?`,
    confirmBody: (name) =>
      `${name} will lose admin privileges and become a regular member.`,
    confirmLabel: 'Demote',
  },
  remove: {
    intent: 'member-remove',
    label: 'Remove from group',
    icon: <LuUserMinus className="h-4 w-4" aria-hidden />,
    destructive: true,
    confirmTitle: (name) => `Remove ${name} from the group?`,
    confirmBody: (name) =>
      `${name} will lose access to this group and its pools. You can invite them back later.`,
    confirmLabel: 'Remove',
  },
};

export function MemberActionsMenu({
  giftGroupId,
  viewerRole,
  member,
  isViewer,
  birthdayLabel,
}: Readonly<{
  giftGroupId: string;
  viewerRole: GroupRole;
  member: MenuMember;
  isViewer: boolean;
  birthdayLabel?: string | null;
}>) {
  const actions = memberMenuActions(viewerRole, member.role, isViewer);
  const fetcher = useFetcher();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, setPending] = useState<MemberMenuAction | null>(null);

  if (actions.length === 0) return null;

  const displayName = member.user.name ?? member.user.username;
  const settingsAction = `/groups/${giftGroupId}/settings`;

  const runAction = (action: MemberMenuAction) => {
    const meta = ACTION_META[action];
    const fd = new FormData();
    fd.set('intent', meta.intent);
    fd.set('giftGroupId', giftGroupId);
    fd.set('memberUserId', member.user.id);
    void fetcher.submit(fd, { method: 'post', action: settingsAction });
  };

  const pendingMeta = pending ? ACTION_META[pending] : null;

  return (
    <>
      {/* Desktop: anchored dropdown */}
      <div className="hidden sm:block">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${displayName}`}
              className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LuEllipsisVertical className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="min-w-[12rem]">
            {actions.map((action) => {
              const meta = ACTION_META[action];
              return (
                <DropdownMenuItem
                  key={action}
                  className={cn(
                    'gap-2 px-2 py-2 text-sm',
                    meta.destructive && 'text-red-600 focus:text-red-700',
                  )}
                  onSelect={(event) => {
                    // preventDefault stops Radix's own close+focus-restore from
                    // racing the dialog; we close the menu ourselves so it
                    // doesn't linger (and aria-hide the row) behind the dialog.
                    event.preventDefault();
                    setMenuOpen(false);
                    setPending(action);
                  }}
                >
                  {meta.icon}
                  {meta.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="sm:hidden">
        <MobileBottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <MobileBottomSheetTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${displayName}`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LuEllipsisVertical className="h-5 w-5" aria-hidden />
            </button>
          </MobileBottomSheetTrigger>
          <MobileBottomSheetContent className="gap-0 p-0 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <MobileBottomSheetTitle className="sr-only">
              Manage {displayName}
            </MobileBottomSheetTitle>
            <MobileBottomSheetDescription className="sr-only">
              Choose a manager action for {displayName}.
            </MobileBottomSheetDescription>
            <div className="flex items-center gap-3 px-5 pb-4 pt-2">
              <Avatar size="s" image={member.user.image} user={member.user} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-bold text-foreground">
                    {displayName}
                  </span>
                  <RoleBadge role={member.role} />
                </div>
                {birthdayLabel ? (
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {birthdayLabel}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="h-px bg-border" />
            {actions.map((action) => {
              const meta = ACTION_META[action];
              return (
                <button
                  key={action}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-3.5 px-5 py-4 text-left text-base font-medium transition-colors hover:bg-muted',
                    meta.destructive ? 'text-red-600' : 'text-foreground',
                  )}
                  onClick={() => {
                    setSheetOpen(false);
                    setPending(action);
                  }}
                >
                  {meta.icon}
                  {meta.label}
                </button>
              );
            })}
            <div className="h-2 bg-muted/40" />
            <MobileBottomSheetClose asChild>
              <button
                type="button"
                className="w-full px-5 py-4 text-center text-base font-bold text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
            </MobileBottomSheetClose>
          </MobileBottomSheetContent>
        </MobileBottomSheet>
      </div>

      {/* Shared confirmation step */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingMeta ? pendingMeta.confirmTitle(displayName) : ''}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {pendingMeta ? pendingMeta.confirmBody(displayName) : ''}
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={pendingMeta?.destructive ? 'destructive' : 'default'}
              onClick={() => {
                if (pending) runAction(pending);
                setPending(null);
              }}
            >
              {pendingMeta?.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
