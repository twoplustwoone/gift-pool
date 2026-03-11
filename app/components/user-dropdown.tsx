import { useRef } from 'react';
import {
  LuLogOut,
  LuSettings,
  LuShield,
  LuUser,
  LuUsers,
} from 'react-icons/lu';
import { Form, Link } from 'react-router';
import { useTranslation } from '#app/utils/i18n.tsx';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { useUser, userHasRole } from '#app/utils/user.ts';
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
  const { t } = useTranslation();
  const isAdmin = userHasRole(user, 'admin');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Link
          to={`/me`}
          onClick={(e) => e.preventDefault()}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <img
            className="size-9 rounded-full object-cover"
            alt={user.name ?? user.username}
            src={getUserImgSrc(user.image?.id)}
            width={256}
            height={256}
          />
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
          {isAdmin ? (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to={`/admin`}>
                <Flex gap={2}>
                  <LuShield className="h-3 w-3" />
                  <Text>Admin</Text>
                </Flex>
              </Link>
            </DropdownMenuItem>
          ) : null}
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
