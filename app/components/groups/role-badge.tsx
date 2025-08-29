import { cn } from '#app/utils/misc.tsx'

type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

const roleStyles: Record<Role, string> = {
  OWNER: 'bg-amber-200 text-amber-900',
  ADMIN: 'bg-blue-200 text-blue-900',
  MEMBER: 'bg-gray-200 text-gray-900',
}

export const RoleBadge = ({ role }: { role: Role }) => (
  <span
    data-testid="role-badge"
    className={cn(
      'rounded px-2 py-0.5 text-[10px] font-medium uppercase',
      roleStyles[role],
    )}
  >
    {role.toLowerCase()}
  </span>
)
