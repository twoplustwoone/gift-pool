import {
  Form,
  Link,
  type LoaderFunctionArgs,
  useLoaderData,
  useSearchParams,
  useSubmit,
} from 'react-router';
import { EmptyRow, SectionCard } from '#app/components/admin-ui.tsx';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Field } from '#app/components/forms.tsx';
import { searchAdminUsers } from '#app/utils/admin.server.ts';
import { useDebounce } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const results = query.length >= 2 ? await searchAdminUsers({ query }) : [];
  return { query, results };
}

const UsersRoute = () => {
  const { query, results } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();

  const handleFormChange = useDebounce((form: HTMLFormElement) => {
    Promise.resolve(submit(form)).catch(() => {});
  }, 300);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h1">Users</h1>
        <p className="text-muted-foreground">
          Search by email, username, or name. Results include role badges and
          lightweight counts.
        </p>
      </div>

      <Form
        method="GET"
        onChange={(e) => handleFormChange(e.currentTarget)}
        className="max-w-xl"
      >
        <Field
          labelProps={{ children: 'Search' }}
          inputProps={{
            type: 'search',
            name: 'q',
            defaultValue: searchParams.get('q') ?? '',
            placeholder: 'email, username, or name…',
            autoFocus: true,
            minLength: 2,
          }}
        />
      </Form>

      <SectionCard
        title={query ? `Results for "${query}"` : 'Type at least 2 characters'}
        description={
          query && results.length > 0
            ? `${results.length} user${results.length === 1 ? '' : 's'}`
            : undefined
        }
      >
        {query.length < 2 ? (
          <EmptyRow>Enter a query to search.</EmptyRow>
        ) : results.length === 0 ? (
          <EmptyRow>No users match &ldquo;{query}&rdquo;.</EmptyRow>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/50">
            <table className="min-w-full divide-y divide-border/60">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    User
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Roles
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Wishlist
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Friends
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {results.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-2">
                      <Link
                        to={`/admin/users/${user.id}`}
                        className="group flex flex-col"
                      >
                        <span className="text-sm font-semibold group-hover:underline">
                          {user.name ?? user.username}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          @{user.username} · {user.email}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {user.roleNames.map((role) => (
                          <span
                            key={role}
                            className={
                              role === 'admin'
                                ? 'rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'
                                : 'rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                            }
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums">
                      {user.wishlistItemCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums">
                      {user.friendshipCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default UsersRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
