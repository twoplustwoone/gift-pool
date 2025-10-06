import { invariantResponse } from '@epic-web/invariant';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Outlet, redirect } from '@remix-run/react';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { requireUsersShareAGroupOrAreFriends } from '#app/utils/groups.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { username } = params;

  const userId = await requireUserId(request);
  await requireUsersShareAGroupOrAreFriends({ userId, username });

  const user = await prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      username: true,
      wishlistItems: { select: { id: true, title: true, ownerId: true } },
      image: { select: { id: true } },
    },
    where: { username },
  });

  invariantResponse(user, 'User not found', { status: 404 });

  if (user.id === userId) {
    return redirect('/me');
  }

  return json({});
}

const Username = () => {
  return (
    <main className="h-full min-h-0 overflow-y-auto">
      <div className="grid h-full min-h-0 w-full rounded-none text-surface-foreground shadow-sm">
        <Outlet />
      </div>
    </main>
  );
};

export default Username;
