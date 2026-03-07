import { type LoaderFunctionArgs } from 'react-router';
import { Link } from 'react-router';
import { LuActivity, LuDatabase } from 'react-icons/lu';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Spacer } from '#app/components/spacer.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  return {};
}
const AdminIndexRoute = () => {
  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-1">
        <h1 className="text-h1">Admin</h1>
        <p className="text-muted-foreground">Quick links to internal tools.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/admin/analytics">
          <Card className="flex h-full flex-col gap-3 border-border/70 bg-card p-4 transition hover:translate-y-[-2px] hover:border-foreground/20 hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LuActivity className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-base font-semibold">Analytics</p>
                <p className="text-sm text-muted-foreground">
                  DAU/WAU/MAU, event counts, and daily active trends.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/cache">
          <Card className="flex h-full flex-col gap-3 border-border/70 bg-card p-4 transition hover:translate-y-[-2px] hover:border-foreground/20 hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LuDatabase className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-base font-semibold">Cache</p>
                <p className="text-sm text-muted-foreground">
                  Inspect and clear LRU + SQLite cache entries.
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
      <Spacer size="xl" />
    </div>
  );
};
export default AdminIndexRoute;
export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
