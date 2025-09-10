import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Outlet } from '@remix-run/react';
import { requireUserId } from '#app/utils/auth.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const GroupsRoute = () => {
  // Mirror the Wishlist route shell so child routes can render their own headers
  return (
    <main className="h-full min-h-0 overflow-y-auto">
      <div className="grid h-full min-h-0 w-full rounded-none text-surface-foreground shadow-sm">
        <Outlet />
      </div>
    </main>
  );
};

export default GroupsRoute;
