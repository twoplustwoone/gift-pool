import { type LoaderFunctionArgs } from 'react-router';
import { Outlet } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return {};
}
const ProfileRoute = () => {
  return (
    <div>
      <Outlet />
    </div>
  );
};
export default ProfileRoute;
