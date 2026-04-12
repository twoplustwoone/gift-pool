import { LuShieldCheck } from 'react-icons/lu';
import {
  Link,
  NavLink,
  Outlet,
  type LoaderFunctionArgs,
} from 'react-router';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
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
      <div className="w-full border-b bg-surface backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="px-2">
                <Link to="/">
                  <Icon name="arrow-left" className="mr-1" /> Home
                </Link>
              </Button>
              <div className="flex items-center gap-3">
                <LuShieldCheck size={24} className="text-primary" />
                <div className="leading-tight">
                  <div className="text-md font-extrabold sm:text-xl">
                    Admin
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Internal operator surface
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
