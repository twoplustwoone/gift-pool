import { type LoaderFunctionArgs } from 'react-router';
import { useLoaderData, useNavigate } from 'react-router';
import { LuPlus, LuUsers } from 'react-icons/lu';
import { GroupCard } from '#app/components/groups/GroupCard.tsx';
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
import { Flex, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { GroupRoleSchema, type GroupRole } from '#app/utils/group-role.ts';
import { CreateGroupCompactForm } from './__group-editor.tsx';
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const groups = await prisma.giftGroup.findMany({
    where: {
      groupMembers: {
        some: {
          userId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      _count: {
        select: {
          groupMembers: true,
        },
      },
      groupMembers: {
        where: {
          userId,
        },
        select: {
          role: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
  const data = groups.map((g) => {
    const rawRole = g.groupMembers[0]?.role ?? 'MEMBER';
    const parsedRole = GroupRoleSchema.catch('MEMBER').parse(rawRole);
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      createdAt: g.createdAt,
      memberCount: g._count.groupMembers,
      myRole: parsedRole as GroupRole,
    };
  });
  return {
    groups: data,
  };
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
        <CreateGroupDialog>
          <Button>
            <Flex gap={1}>
              <LuPlus />
              <Text>Create your first group</Text>
            </Flex>
          </Button>
        </CreateGroupDialog>
      </div>
    </Card>
  );
  const navigate = useNavigate();
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header bar (mirrors Wishlist header style) */}
      <div className="border-b bg-surface px-4 py-4 shadow">
        <div className="container flex items-center justify-between gap-2">
          <Heading>
            <Flex gap={2} align="center">
              <LuUsers className="text-primary" />
              <Text size="xl" weight="bold">
                Groups
              </Text>
            </Flex>
          </Heading>
          <CreateGroupDialog>
            <Button>
              <Flex gap={1}>
                <LuPlus />
                <Text>Create Group</Text>
              </Flex>
            </Button>
          </CreateGroupDialog>
        </div>
      </div>

      {/* Content */}
      <div className="container min-h-0 flex-1 py-8">
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
      <div className="fixed bottom-[calc(theme(spacing.4)+theme(spacing.bottom-nav))] right-4 z-40 sm:hidden">
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
              <LuUsers className="text-primary" />{' '}
              <Text weight="bold">Create New Group</Text>
            </Flex>
          </DialogTitle>
        </DialogHeader>
        <CreateGroupCompactForm />
      </DialogContent>
    </Dialog>
  );
};

// GroupCard moved to shared component

export default GroupsIndex;
