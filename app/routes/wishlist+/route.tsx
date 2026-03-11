import { type LoaderFunctionArgs, Outlet  } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return {};
}
const WishlistRoute = () => {
  return (
    <main className="h-full min-h-0 overflow-y-auto">
      <div className="grid h-full min-h-0 w-full rounded-none text-surface-foreground shadow-sm">
        <Outlet />
      </div>
    </main>
  );
};
export default WishlistRoute;
