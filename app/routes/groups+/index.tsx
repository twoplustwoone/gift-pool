import { invariantResponse } from '@epic-web/invariant';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData, useNavigate } from '@remix-run/react';
import { useState } from 'react';
import { usePressFeedback } from '#app/components/wishlist/hooks/use-press-feedback.ts';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '#app/components/ui/dialog.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const groups = await prisma.giftGroup.findMany({
    where: {
      groupMembers: { some: { userId } },
    },
    select: {
      id: true,
      name: true,
      description: true,
      groupMembers: {
        select: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              birthday: true,
              image: { select: { id: true, altText: true } },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const today = new Date();
  const data = groups.map((g) => {
    const members = g.groupMembers.map((m) => m.user);
    const upcoming = members
      .filter((u) => !!u.birthday)
      .map((u) => {
        const bday = new Date(u.birthday as unknown as string);
        const thisYear = new Date(
          today.getFullYear(),
          bday.getMonth(),
          bday.getDate(),
        );
        const next =
          thisYear >= new Date(today.getFullYear(), today.getMonth(), today.getDate())
            ? thisYear
            : new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
        const inDays = Math.ceil(
          (next.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return { user: u, date: next.toISOString(), inDays };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      memberCount: members.length,
      nextBirthday: upcoming,
    };
  });

  return json({ groups: data });
}

const GroupsIndex = () => {
  const { groups } = useLoaderData<typeof loader>();

  const EmptyState = (
    <Card padding="lg" className="rounded-2xl text-center">
      <div className="text-lg font-semibold">You don’t have any groups yet.</div>
      <div className="mt-2 text-sm text-muted-foreground">
        Create your first group to start planning together.
      </div>
      <div className="mt-4">
        <Button asChild>
          <Link to="/groups/new">Create your first group</Link>
        </Button>
      </div>
    </Card>
  );

  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="mb-4 flex items-center justify-between">
          <Heading>My Groups</Heading>
          <CreateGroupDialog>
            <Button>
              <Icon name="plus" /> Create Group
            </Button>
          </CreateGroupDialog>
        </div>

        {groups.length === 0 ? (
          <div className="mx-auto max-w-lg">{EmptyState}</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <GroupCard key={g.id} g={g} onOpen={() => navigate(`/groups/${g.id}`)} />
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-5 right-4 z-20 sm:hidden">
        <CreateGroupDialog>
          <Button size="icon" className="rounded-full shadow-lg" aria-label="Create Group">
            <Icon name="plus" />
          </Button>
        </CreateGroupDialog>
      </div>
    </div>
  );
};

function CreateGroupDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
        </DialogHeader>
        <form method="post" action="/groups/new" className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="group-name">Name</Label>
            <Input id="group-name" name="name" required minLength={1} maxLength={100} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="group-description">Description</Label>
            <Input id="group-description" name="description" required minLength={1} maxLength={1000} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GroupCard({ g, onOpen }: { g: {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  nextBirthday: null | { user: any; date: string; inDays: number };
}; onOpen: () => void }) {
  const press = usePressFeedback<HTMLDivElement>({ onClick: onOpen });

  return (
    <Card
      padding="lg"
      className={
        'rounded-2xl h-full cursor-pointer touch-pan-y transition [-webkit-tap-highlight-color:transparent] data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      }
      role="link"
      tabIndex={0}
      aria-label={`Open group ${g.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      data-pressed={press.pressed ? 'true' : 'false'}
      {...press.rowProps}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-base font-semibold">{g.name}</div>
          <Link
            to={`/groups/${g.id}`}
            aria-label={`View ${g.name}`}
            className="text-muted-foreground transition-transform data-[pressed=true]:translate-x-0.5"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <Icon name="chevron-right" />
          </Link>
        </div>
        {g.description ? (
          <div className="text-sm text-muted-foreground line-clamp-2">{g.description}</div>
        ) : null}
        <div className="rounded-xl border border-subcard-border bg-subcard p-2 text-sm flex items-center gap-2">
          <Icon name="person" className="text-muted-foreground" />
          <div className="text-muted-foreground">{g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}</div>
        </div>
        {g.nextBirthday ? (
          <Link
            to={`/users/${g.nextBirthday.user.username}/wishlist`}
            className="rounded-xl border border-subcard-border bg-subcard p-2 flex items-center gap-3 hover:border-accent"
            aria-label={`View ${g.nextBirthday.user.username}'s wishlist`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <Avatar size="s" user={g.nextBirthday.user} image={g.nextBirthday.user.image} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{g.nextBirthday.user.username}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(g.nextBirthday.date).toLocaleDateString()} • in {g.nextBirthday.inDays} days
              </div>
            </div>
            <Icon name="chevron-right" className="text-muted-foreground" />
          </Link>
        ) : (
          <div className="rounded-xl border border-subcard-border bg-subcard p-2 text-sm text-muted-foreground">No upcoming birthdays</div>
        )}
      </div>
    </Card>
  );
}

export default GroupsIndex;
