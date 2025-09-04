import { cn } from '#app/utils/misc.tsx';

export function RoleBadge({ role }: { role: 'OWNER' | 'ADMIN' | 'MEMBER' | string }) {
  const label = role.toString();
  const color =
    role === 'OWNER' ? 'bg-purple-600' : role === 'ADMIN' ? 'bg-blue-600' : 'bg-gray-600';
  return (
    <span className={cn('rounded px-2 py-0.5 text-xs font-semibold text-white', color)}>
      {label}
    </span>
  );
}

