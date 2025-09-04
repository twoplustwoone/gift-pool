import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Outlet } from '@remix-run/react';
import { requireUserId } from '#app/utils/auth.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const GroupsRoute = () => {
  return (
    <main className="container h-full min-h-0 px-0 md:px-8 md:pb-12">
      <div className="grid h-full min-h-0 w-full overflow-y-auto rounded-none border border-surface-border bg-surface px-2 pb-4 text-surface-foreground shadow-sm md:container md:rounded-3xl">
        <Outlet />
      </div>
    </main>
  );
};

export default GroupsRoute;
