import { type Meta, type StoryObj } from '@storybook/react-vite';
import { LuPlus, LuUsers } from 'react-icons/lu';
import {
  GroupCard,
  type GroupCardData,
} from '#app/components/groups/GroupCard';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Flex, Text } from '#app/components/ui-kit';

function GroupsListDemo({ groups }: { groups: GroupCardData[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-4 shadow">
        <div className="container flex items-center justify-between gap-2">
          <Heading>
            <Flex gap={2} align="center">
              <LuUsers className="text-primary" />
              <Text size="xl" weight="bold">
                Groups
              </Text>
            </Flex>
          </Heading>
          <Button>
            <Flex gap={1}>
              <LuPlus />
              <Text>Create Group</Text>
            </Flex>
          </Button>
        </div>
      </div>

      <div className="container min-h-0 flex-1 py-8">
        {groups.length === 0 ? (
          <div className="mx-auto max-w-lg">
            <Card padding="lg" className="rounded-2xl text-center">
              <div className="text-lg font-semibold">
                You don’t have any groups yet.
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Create your first group to start planning together.
              </div>
              <div className="mt-4">
                <Button>
                  <Flex gap={1}>
                    <LuPlus />
                    <Text>Create your first group</Text>
                  </Flex>
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <GroupCard key={g.id} g={g} onOpen={() => {}} />
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-[calc(theme(spacing.4)+env(safe-area-inset-bottom)+4rem)] right-4 z-40 sm:hidden">
        <Button
          type="button"
          size="icon"
          aria-label="Create Group"
          title="Create Group"
          className="h-14 w-14 rounded-full border bg-primary text-primary-foreground shadow-lg"
        >
          <Icon name="plus" />
        </Button>
      </div>
    </div>
  );
}

const sampleGroups: GroupCardData[] = [
  {
    id: '1',
    name: 'Family Gift Exchange',
    description: 'Annual holiday exchange with the whole family.',
    memberCount: 8,
    createdAt: new Date('2024-11-15'),
    myRole: 'OWNER',
  },
  {
    id: '2',
    name: 'Office Secret Santa',
    description: 'Coworkers-only gift swap. $25 limit.',
    memberCount: 12,
    createdAt: new Date('2024-10-01'),
    myRole: 'ADMIN',
  },
  {
    id: '3',
    name: 'Neighborhood Potluck',
    description: null,
    memberCount: 6,
    createdAt: new Date('2024-08-20'),
    myRole: 'MEMBER',
  },
];

const meta = {
  title: 'Groups/Groups',
  component: GroupsListDemo,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof GroupsListDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { groups: [] },
};

export const SomeGroups: Story = {
  args: { groups: sampleGroups },
};

export const ManyGroups: Story = {
  args: {
    groups: Array.from({ length: 9 }).map((_, i) => ({
      ...sampleGroups[i % sampleGroups.length],
      id: String(i + 1),
      name: `Group ${i + 1}`,
    })) as GroupCardData[],
  },
};
