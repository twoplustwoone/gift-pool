import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { Outlet } from '@remix-run/react';
import { requireUserId } from '#app/utils/auth.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const WishlistRoute = () => {
  return (
    <main className="container flex h-full min-h-[400px] px-0 md:px-8 md:pb-12">
      <div className="grid w-full rounded-none border border-surface-border bg-surface px-2 pb-4 text-surface-foreground shadow-sm md:container md:rounded-3xl">
        <Outlet />
      </div>
    </main>
  );
};

export default WishlistRoute;
