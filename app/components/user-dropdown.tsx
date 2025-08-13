import { Form, Link } from '@remix-run/react';
import { useRef } from 'react';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import { useUser } from '#app/utils/user.ts';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import { Icon } from './ui/icon';

export const UserDropdown = () => {
  const user = useUser();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Link
          to={`/me`}
          // this is for progressive enhancement
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-11 sm:bg-secondary sm:px-4 sm:text-secondary-foreground sm:hover:bg-secondary/80"
        >
          <img
            className="size-10 rounded-full object-cover sm:size-8"
            alt={user.name ?? user.username}
            src={getUserImgSrc(user.image?.id)}
            width={256}
            height={256}
          />
          <span className="hidden text-body-sm font-bold sm:inline">
            {user.name ?? user.username}
          </span>
        </Link>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent sideOffset={8} align="end">
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to={`/me`}>
              <Icon className="text-body-md" name="avatar">
                Profile
              </Icon>
            </Link>
          </DropdownMenuItem>
          <Form action="/logout" method="POST" ref={formRef}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <Icon className="text-body-md" name="exit">
                  Logout
                </Icon>
              </button>
            </DropdownMenuItem>
          </Form>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
