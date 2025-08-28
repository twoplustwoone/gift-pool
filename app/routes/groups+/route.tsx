import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Outlet } from '@remix-run/react';
import { requireUserId } from '#app/utils/auth.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const GroupsRoute = () => {
  return (
    <main className="container h-full min-h-0 px-0 pb-12 md:px-8">
      <div className="grid h-full min-h-0 w-full bg-muted pl-2 pr-2 md:container md:rounded-3xl">
        <Outlet />
      </div>
    </main>
  );
};

export default GroupsRoute;
