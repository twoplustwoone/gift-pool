import { LuShieldCheck } from 'react-icons/lu';
import {
  NavLink,
  Outlet,
  type LoaderFunctionArgs,
} from 'react-router';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { Stack } from '#app/components/ui-kit/stack.tsx';
import { cn } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  return {};
}

type Tab = { to: string; label: string; end?: boolean };

const TABS: ReadonlyArray<Tab> = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/pools', label: 'Pools' },
  { to: '/admin/ops', label: 'Ops' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/cache', label: 'Cache' },
];

const AdminLayout = () => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        variant="detail"
        back={{ label: 'Home', href: '/' }}
        icon={<LuShieldCheck size={24} className="text-primary" />}
        title="Admin"
        subtitle="Internal operator surface"
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <Stack gap={6}>
            <TabBar />
            <Outlet />
          </Stack>
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

const TabBar = () => {
  return (
    <div className="grid w-full grid-cols-3 rounded-2xl bg-muted p-1 sm:grid-cols-6">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'px-4 py-1.5 text-center text-sm font-medium text-muted-foreground',
              'rounded-xl transition-colors',
              isActive && 'bg-background text-foreground shadow',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
};

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
