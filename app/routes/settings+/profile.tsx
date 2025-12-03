import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Link, Outlet, useMatches } from '@remix-run/react';
import { Fragment, type ReactNode } from 'react';
import { z } from 'zod';
import { Spacer } from '#app/components/spacer.tsx';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#app/components/ui/breadcrumb.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { useUser } from '#app/utils/user.ts';

export const BreadcrumbHandle = z.object({ breadcrumb: z.any() });
export type BreadcrumbHandle = z.infer<typeof BreadcrumbHandle>;

export const handle: BreadcrumbHandle & SEOHandle = {
  breadcrumb: <Icon name="file-text">Edit Profile</Icon>,
  getSitemapEntries: () => null,
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  invariantResponse(user, 'User not found', { status: 404 });
  return json({});
}

const BreadcrumbHandleMatch = z.object({
  handle: BreadcrumbHandle,
});

const EditUserProfile = () => {
  const user = useUser();
  const matches = useMatches();
  const breadcrumbs = matches
    .map((m) => {
      const result = BreadcrumbHandleMatch.safeParse(m);
      if (!result.success || !result.data.handle.breadcrumb) return null;
      return {
        id: m.id,
        to: m.pathname,
        content: result.data.handle.breadcrumb,
      };
    })
    .filter(Boolean) as { id: string; to: string; content: ReactNode }[];

  return (
    <div className="m-auto mb-24 mt-16 max-w-3xl">
      <Breadcrumb className="container">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link className="text-muted-foreground" to={`/users/${user.username}`}>
                Profile
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbs.map((breadcrumb, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <Fragment key={breadcrumb.id}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{breadcrumb.content}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link className="text-muted-foreground" to={breadcrumb.to}>
                        {breadcrumb.content}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <Spacer size="xs" />
      <main className="mx-auto bg-muted px-6 py-8 md:container md:rounded-3xl">
        <Outlet />
      </main>
    </div>
  );
};

export default EditUserProfile;
