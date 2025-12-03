import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Link, Outlet } from '@remix-run/react';
import { Fragment } from 'react';
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
import { useProfileBreadcrumbs, type BreadcrumbHandle } from './profile-breadcrumbs.tsx';

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

const EditUserProfile = () => {
  const user = useUser();
  const breadcrumbs = useProfileBreadcrumbs();

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
