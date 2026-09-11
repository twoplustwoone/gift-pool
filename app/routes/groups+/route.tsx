import { type LoaderFunctionArgs, Outlet  } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return {};
}
const GroupsRoute = () => {
  // Mirror the Wishlist route shell so child routes can render their own headers
  return (
    <main className="w-full min-w-0">
      <div className="w-full min-w-0 rounded-none text-surface-foreground shadow-sm">
        <Outlet />
      </div>
    </main>
  );
};
export default GroupsRoute;
