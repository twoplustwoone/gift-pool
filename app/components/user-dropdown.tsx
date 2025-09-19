import { Form, Link } from '@remix-run/react';
import { useRef } from 'react';
import { LuBell, LuLogOut, LuSettings, LuUser, LuUsers } from 'react-icons/lu';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { useUser } from '#app/utils/user.ts';
import { useNotificationsStore } from '#app/components/notifications/notifications-context.tsx';
import { useTranslation } from '#app/utils/i18n.tsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { Flex, Text } from './ui-kit';

export const UserDropdown = () => {
  const user = useUser();
  const formRef = useRef<HTMLFormElement>(null);
  const { unreadCount } = useNotificationsStore();
  const hasUnread = unreadCount > 0;
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Link
          to={`/me`}
          onClick={(e) => e.preventDefault()}
          className="relative inline-flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <img
            className="size-8 rounded-full object-cover"
            alt={user.name ?? user.username}
            src={getUserImgSrc(user.image?.id)}
            width={256}
            height={256}
          />
          {hasUnread ? (
            <span className="absolute -top-0.5 -right-0.5 inline-flex min-h-3 min-w-3 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Link>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent sideOffset={8} align="end" className="sm:w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="text-sm font-bold">
              {user.name ?? user.username}
            </span>
            <span className="text-xs text-muted-foreground">
              {user.username}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to={`/me`}>
              <Flex gap={2}>
                <LuUser className="h-3 w-3" />
                <Text>Profile</Text>
              </Flex>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              window.dispatchEvent(new Event('notifications:open'));
            }}
          >
            <Flex gap={2} className="items-center">
              <LuBell className="h-3 w-3" />
              <Text className="flex-1">{t('notifications.menuItem')}</Text>
              {hasUnread ? (
                <span className="ml-2 inline-flex min-h-3 min-w-3 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </Flex>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to={`/settings/profile`}>
              <Flex gap={2}>
                <LuSettings className="h-3 w-3" />
                <Text>Settings</Text>
              </Flex>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to={`/friends`}>
              <Flex gap={2}>
                <LuUsers className="h-3 w-3" />
                <Text>{t('friends.friends')}</Text>
              </Flex>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <Form action="/logout" method="POST" ref={formRef}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">
                <Flex gap={2}>
                  <LuLogOut className="h-3 w-3" />
                  <Text>Log out</Text>
                </Flex>
              </button>
            </DropdownMenuItem>
          </Form>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
