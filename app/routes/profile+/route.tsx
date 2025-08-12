import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Outlet } from '@remix-run/react';
import { requireUserId } from '#app/utils/auth.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const ProfileRoute = () => {
  return (
    <div>
      <Outlet />
    </div>
  );
};

export default ProfileRoute;
