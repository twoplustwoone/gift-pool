import { type Meta, type StoryObj } from '@storybook/react-vite';
import { LuUsers } from 'react-icons/lu';
import { RoleBadge } from '#app/components/groups/RoleBadge';
import { Button } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Flex } from '#app/components/ui-kit/flex';
import { Stack } from '#app/components/ui-kit/stack';
import  { type GroupRole } from '#app/utils/group-role.ts';
import { cn } from '#app/utils/misc.tsx';

type ActiveTab = 'overview' | 'members' | 'settings' | 'activity';

function TabBarDemo({
  giftGroupId,
  canSettings,
  active,
}: {
  giftGroupId: string;
  canSettings: boolean;
  active: ActiveTab;
}) {
  const tabs = [
    { to: `/groups/${giftGroupId}`, label: 'Overview', key: 'overview' as const },
    { to: `/groups/${giftGroupId}/members`, label: 'Members', key: 'members' as const },
    ...(canSettings
      ? ([{ to: `/groups/${giftGroupId}/settings`, label: 'Settings', key: 'settings' as const }] as const)
      : ([] as const)),
    { to: `/groups/${giftGroupId}/activity`, label: 'Activity', key: 'activity' as const },
  ];

  const colsClass = canSettings ? 'grid-cols-4' : 'grid-cols-3';

  return (
    <div className={`grid w-full ${colsClass} rounded-full bg-muted p-1`}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <a
            key={t.to}
            href={t.to}
            className={cn(
              'px-4 py-1.5 text-center text-sm font-medium text-muted-foreground',
              'rounded-full transition-colors',
              isActive && 'bg-background text-foreground shadow',
            )}
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}

function GroupPageDemo({
  group,
  viewerRole,
  canSettings,
  activeTab = 'overview',
  children,
}: {
  group: { id: string; name: string; memberCount: number };
  viewerRole: GroupRole;
  canSettings: boolean;
  activeTab?: ActiveTab;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="w-full border-b bg-surface backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="px-2">
                <Icon name="arrow-left" className="mr-1" /> Back to Groups
              </Button>
              <div className="flex items-center gap-3">
                <LuUsers size={24} className="text-primary" />
                <div className="leading-tight">
                  <div className="text-md font-extrabold sm:text-xl">{group.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {group.memberCount} members
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={viewerRole} />
            </div>
          </div>
        </div>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <Stack gap={6}>
            <TabBarDemo giftGroupId={group.id} canSettings={canSettings} active={activeTab} />
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              {children ?? 'Page content goes here.'}
            </div>
          </Stack>
        </div>
      </main>
    </div>
  );
}

const meta = {
  title: 'Groups/GroupPage',
  component: GroupPageDemo,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  argTypes: {
    children: { table: { disable: true } },
  },
  args: {
    group: { id: 'g1', name: 'Family Gift Exchange', memberCount: 8 },
    viewerRole: 'MEMBER' as GroupRole,
    canSettings: false,
    activeTab: 'overview' as ActiveTab,
  },
} satisfies Meta<typeof GroupPageDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};

export const Admin: Story = {
  args: {
    viewerRole: 'ADMIN',
    canSettings: true,
  },
};

export const Owner: Story = {
  args: {
    viewerRole: 'OWNER',
    canSettings: true,
  },
};

export const LongGroupName: Story = {
  args: {
    group: {
      id: 'g2',
      name: 'A Very Long Group Name That Tests Line Wrapping And Layout For The Header Bar',
      memberCount: 23,
    },
  },
};

export const MembersTabActive: Story = {
  args: {
    activeTab: 'members',
  },
};

export const SettingsTabVisible: Story = {
  args: {
    viewerRole: 'ADMIN',
    canSettings: true,
    activeTab: 'settings',
  },
};

