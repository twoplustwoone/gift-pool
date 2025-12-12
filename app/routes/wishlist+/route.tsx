import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { Outlet } from '@remix-run/react';
import { requireUserId } from '#app/utils/auth.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const WishlistRoute = () => {
  return (
    <main className="w-full">
      <div className="grid w-full rounded-none text-surface-foreground shadow-sm">
        <Outlet />
      </div>
    </main>
  );
};

export default WishlistRoute;
