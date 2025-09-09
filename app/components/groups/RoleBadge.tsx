import { AiOutlineUser } from 'react-icons/ai';
import { FiShield } from 'react-icons/fi';
import { LuCrown } from 'react-icons/lu';
import { type GroupRole } from '#app/utils/group-role.ts';
import { cn } from '#app/utils/misc.tsx';
import { Flex, Text } from '../ui-kit';

const roleMeta: Record<
  GroupRole,
  { label: string; icon: React.ReactNode; bg: string; text: string }
> = {
  OWNER: {
    label: 'owner',
    icon: <LuCrown className="text-amber-300" />,
    bg: 'bg-primary',
    text: 'text-primary-foreground',
  },
  ADMIN: {
    label: 'admin',
    icon: <FiShield className="text-blue-500" />,
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  },
  MEMBER: {
    label: 'member',
    icon: <AiOutlineUser />,
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  },
};

export function RoleBadge({ role }: { role: GroupRole }) {
  const meta = roleMeta[role];

  return (
    <Text size="xs" weight="extrabold">
      <Flex className={cn('rounded px-2 py-0.5', meta.bg, meta.text)} gap={1}>
        {meta.icon}
        {meta.label}
      </Flex>
    </Text>
  );
}
