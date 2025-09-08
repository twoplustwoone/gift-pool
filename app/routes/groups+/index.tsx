import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData, useNavigate } from '@remix-run/react';
import { FaUsers } from 'react-icons/fa';
import { FaGear, FaPlus } from 'react-icons/fa6';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { usePressFeedback } from '#app/components/wishlist/hooks/use-press-feedback.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { CreateGroupCompactForm } from './__group-editor.tsx';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const groups = await prisma.giftGroup.findMany({
    where: { groupMembers: { some: { userId } } },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      _count: { select: { groupMembers: true } },
      groupMembers: { where: { userId }, select: { role: true } },
    },
    orderBy: { name: 'asc' },
  });

  const data = groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    createdAt: g.createdAt,
    memberCount: g._count.groupMembers,
    myRole: g.groupMembers[0]?.role ?? 'MEMBER',
  }));

  return json({ groups: data });
}

export { action } from './__group-editor.server';

const GroupsIndex = () => {
  const { groups } = useLoaderData<typeof loader>();

  const EmptyState = (
    <Card padding="lg" className="rounded-2xl text-center">
      <div className="text-lg font-semibold">
        You don’t have any groups yet.
      </div>
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
      {/* Header bar (mirrors Wishlist header style) */}
      <div className="border-b px-4 py-4 shadow">
        <div className="container flex items-center justify-between gap-2">
          <Heading>
            <Flex gap={2} align="center">
              <FaUsers className="fill-primary" />
              <Text size="xl" weight="bold">
                Groups
              </Text>
            </Flex>
          </Heading>
          <CreateGroupDialog>
            <Button>
              <Flex gap={1}>
                <FaPlus />
                <Text>Create Group</Text>
              </Flex>
            </Button>
          </CreateGroupDialog>
        </div>
      </div>

      {/* Content */}
      <div className="container min-h-0 flex-1 py-8 pb-bottom-nav sm:pb-0">
        {groups.length === 0 ? (
          <div className="mx-auto max-w-lg">{EmptyState}</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                g={g}
                onOpen={() => navigate(`/groups/${g.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating create button for mobile */}
      <div className="fixed bottom-[calc(theme(spacing.4)+env(safe-area-inset-bottom)+4rem)] right-4 z-40 sm:hidden">
        <CreateGroupDialog>
          <Button
            type="button"
            size="icon"
            aria-label="Create Group"
            title="Create Group"
            className="h-14 w-14 rounded-full border bg-primary text-primary-foreground shadow-lg"
          >
            <Icon name="plus" />
          </Button>
        </CreateGroupDialog>
      </div>
    </div>
  );
};

const CreateGroupDialog = ({ children }: { children: React.ReactNode }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Flex gap={2}>
              <FaUsers className="fill-primary" />{' '}
              <Text weight="bold">Create New Group</Text>
            </Flex>
          </DialogTitle>
        </DialogHeader>
        <CreateGroupCompactForm />
      </DialogContent>
    </Dialog>
  );
};

const GroupCard = ({
  g,
  onOpen,
}: {
  g: {
    id: string;
    name: string;
    description?: string | null;
    memberCount: number;
    createdAt: string | Date;
    myRole: 'OWNER' | 'ADMIN' | 'MEMBER' | string;
  };
  onOpen: () => void;
}) => {
  const press = usePressFeedback<HTMLDivElement>({ onClick: onOpen });

  return (
    <Card
      padding="lg"
      className={
        'h-full cursor-pointer touch-pan-y rounded-2xl shadow transition [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[pressed=true]:scale-[0.99] data-[pressed=true]:bg-accent/30'
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
      <Stack gap={6}>
        {/* Title + role badge */}
        <Stack gap={1}>
          <div className="flex items-start justify-between gap-3">
            <Text weight="bold" size="lg">
              {g.name}
            </Text>
            <RoleBadge role={g.myRole} />
          </div>

          {g.description ? (
            <div className="line-clamp-2 text-sm text-muted-foreground">
              {g.description}
            </div>
          ) : null}
        </Stack>

        {/* Stats */}
        <Stack gap={1} className="border-b pb-3">
          <div className="h-px w-full" />
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Members</div>
            <div className="font-medium">{g.memberCount}</div>
          </div>
          <div className="h-px w-full" />
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Created</div>
            <div className="font-medium">
              {new Date(g.createdAt).toLocaleDateString()}
            </div>
          </div>
        </Stack>

        {/* Manage action */}
      </Stack>
      <div className="pt-3">
        <Link
          to={`/groups/${g.id}/settings`}
          className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <FaGear />
          Manage Group
        </Link>
      </div>
    </Card>
  );
};

export default GroupsIndex;
