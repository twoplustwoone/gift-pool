import { LuCrown, LuShield, LuUser } from 'react-icons/lu';
import { type GroupRole } from '#app/utils/group-role.ts';
import { cn } from '#app/utils/misc.tsx';
import { Flex, Text } from '../ui-kit';

const roleMeta: Record<
  GroupRole,
  { label: string; icon: React.ReactNode; bg: string; text: string }
> = {
  OWNER: {
    label: 'owner',
    icon: <LuCrown />,
    bg: 'bg-primary',
    text: 'text-primary-foreground',
  },
  ADMIN: {
    label: 'admin',
    icon: <LuShield />,
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  },
  MEMBER: {
    label: 'member',
    icon: <LuUser />,
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  },
};

export function RoleBadge({ role }: { role: GroupRole }) {
  const meta = roleMeta[role];

  return (
    <Text size="xs" weight="extrabold">
      <Flex
        className={cn('rounded-full px-2 py-0.5', meta.bg, meta.text)}
        gap={1}
      >
        {meta.icon}
        {meta.label}
      </Flex>
    </Text>
  );
}
