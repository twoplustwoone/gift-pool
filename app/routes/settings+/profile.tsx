import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { type LoaderFunctionArgs, Outlet } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  invariantResponse(user, 'User not found', { status: 404 });
  return {};
}

const SettingsProfileLayout = () => {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <Outlet />
    </main>
  );
};
export default SettingsProfileLayout;
