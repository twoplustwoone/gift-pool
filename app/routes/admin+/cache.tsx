import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { type ReactNode } from 'react';
import {
  LuDatabase,
  LuExternalLink,
  LuHardDrive,
  LuSearch,
  LuServer,
  LuTrash2,
} from 'react-icons/lu';
import {
  Form,
  Link,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
  useSearchParams,
  useSubmit,
} from 'react-router';
import {
  EmptyRow,
  SectionCard,
  SummaryCard,
} from '#app/components/admin-ui.tsx';
import { ErrorFallback, GeneralErrorBoundary } from '#app/components/error-boundary';
import { Button } from '#app/components/ui/button.tsx';
import { Input } from '#app/components/ui/input.tsx';
import {
  cache,
  getAllCacheKeys,
  lruCache,
  searchCacheKeys,
} from '#app/utils/cache.server.ts';
import {
  ensureInstance,
  getAllInstances,
  getInstanceInfo,
} from '#app/utils/litefs.server.ts';
import { cn, useDebounce, useDoubleCheck } from '#app/utils/misc.tsx';
import { requireUserWithRole } from '#app/utils/permissions.server.ts';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get('query');
  if (query === '') {
    searchParams.delete('query');
    return redirect(`/admin/cache?${searchParams.toString()}`);
  }
  const limit = Number(searchParams.get('limit') ?? 100);
  const currentInstanceInfo = await getInstanceInfo();
  const instance =
    searchParams.get('instance') ?? currentInstanceInfo.currentInstance;
  const instances = await getAllInstances();
  await ensureInstance(instance);
  let cacheKeys: {
    sqlite: Array<string>;
    lru: Array<string>;
  };
  if (typeof query === 'string') {
    cacheKeys = await searchCacheKeys(query, limit);
  } else {
    cacheKeys = await getAllCacheKeys(limit);
  }
  return {
    cacheKeys,
    instance,
    instances,
    currentInstanceInfo,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUserWithRole(request, 'admin');
  const formData = await request.formData();
  const key = formData.get('cacheKey');
  const { currentInstance } = await getInstanceInfo();
  const instance = formData.get('instance') ?? currentInstance;
  const type = formData.get('type');
  invariantResponse(typeof key === 'string', 'cacheKey must be a string');
  invariantResponse(typeof type === 'string', 'type must be a string');
  invariantResponse(typeof instance === 'string', 'instance must be a string');
  await ensureInstance(instance);
  switch (type) {
    case 'sqlite': {
      await cache.delete(key);
      break;
    }
    case 'lru': {
      lruCache.delete(key);
      break;
    }
    default: {
      throw new Error(`Unknown cache type: ${type}`);
    }
  }
  return {
    success: true,
  };
}

const CacheAdminRoute = () => {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const query = searchParams.get('query') ?? '';
  const limit = searchParams.get('limit') ?? '100';
  const instance = searchParams.get('instance') ?? data.instance;
  const sqliteCount = data.cacheKeys.sqlite.length;
  const lruCount = data.cacheKeys.lru.length;
  const totalCount = sqliteCount + lruCount;
  const selectedRegion = data.instances[instance] ?? 'unknown region';
  const selectedIsPrimary =
    instance === data.currentInstanceInfo.primaryInstance;
  const selectedIsCurrent =
    instance === data.currentInstanceInfo.currentInstance;
  const handleFormChange = useDebounce((form: HTMLFormElement) => {
    Promise.resolve(submit(form)).catch(() => {});
  }, 400);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Cache</h1>
        <p className="text-muted-foreground">
          Inspect and clear instance-local LRU entries plus the
          LiteFS-replicated SQLite cache.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Entries shown"
          value={totalCount}
          delta={query ? `matching "${query}"` : `limited to ${limit}`}
        />
        <SummaryCard
          label="LRU entries"
          value={lruCount}
          delta="instance-local memory"
        />
        <SummaryCard
          label="SQLite entries"
          value={sqliteCount}
          delta="replicated persistent cache"
        />
        <SummaryCard
          label="Selected instance"
          value={instance}
          delta={[
            selectedRegion,
            selectedIsCurrent ? 'current' : null,
            selectedIsPrimary ? 'primary' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      </section>

      <Form
        method="get"
        className="rounded-lg border border-border/70 bg-card p-4 shadow-sm"
        onChange={(event) => handleFormChange(event.currentTarget)}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px_minmax(220px,280px)_auto] lg:items-end">
          <label className="space-y-2">
            <span className="text-sm font-medium">Search key</span>
            <div className="relative">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                type="search"
                name="query"
                defaultValue={query}
                placeholder="admin:analytics, user id, route..."
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium">Limit</span>
            <Input
              name="limit"
              defaultValue={limit}
              type="number"
              step="1"
              min="1"
              max="10000"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium">Instance</span>
            <select
              name="instance"
              defaultValue={instance}
              className="flex h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm ring-offset-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {Object.entries(data.instances).map(([inst, region]) => (
                <option key={inst} value={inst}>
                  {[
                    inst,
                    `(${region})`,
                    inst === data.currentInstanceInfo.currentInstance
                      ? '(current)'
                      : '',
                    inst === data.currentInstanceInfo.primaryInstance
                      ? '(primary)'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit" className="gap-2">
            <LuSearch className="h-4 w-4" />
            Search
          </Button>
        </div>
      </Form>

      <section className="grid gap-4 xl:grid-cols-2">
        <CacheKeySection
          title="LRU cache"
          description="Fast in-memory entries. These are local to the selected app instance."
          icon={<LuHardDrive className="h-4 w-4" />}
          keys={data.cacheKeys.lru}
          instance={instance}
          type="lru"
        />
        <CacheKeySection
          title="SQLite cache"
          description="Persistent cache entries replicated by LiteFS."
          icon={<LuDatabase className="h-4 w-4" />}
          keys={data.cacheKeys.sqlite}
          instance={instance}
          type="sqlite"
        />
      </section>
    </div>
  );
};
export default CacheAdminRoute;

const CacheKeySection = ({
  title,
  description,
  icon,
  keys,
  instance,
  type,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  keys: Array<string>;
  instance: string;
  type: 'sqlite' | 'lru';
}) => (
  <SectionCard
    title={title}
    description={description}
    action={
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {icon}
        {keys.length.toLocaleString()}
      </span>
    }
  >
    {keys.length === 0 ? (
      <EmptyRow>No {title.toLowerCase()} entries match this filter.</EmptyRow>
    ) : (
      <div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
        {keys.map((key) => (
          <CacheKeyRow
            key={key}
            cacheKey={key}
            instance={instance}
            type={type}
          />
        ))}
      </div>
    )}
  </SectionCard>
);

const CacheKeyRow = ({
  cacheKey,
  instance,
  type,
}: {
  cacheKey: string;
  instance: string;
  type: 'sqlite' | 'lru';
}) => {
  const fetcher = useFetcher<typeof action>();
  const dc = useDoubleCheck();
  const encodedKey = encodeURIComponent(cacheKey);
  const valuePage = `/admin/cache/${type}/${encodedKey}?instance=${encodeURIComponent(
    instance,
  )}`;
  const isDeleting = fetcher.state !== 'idle';

  return (
    <div className="grid gap-3 bg-card px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
            )}
          >
            {type === 'sqlite' ? (
              <LuDatabase className="h-3.5 w-3.5" />
            ) : (
              <LuServer className="h-3.5 w-3.5" />
            )}
            {type.toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground">{instance}</span>
        </div>
        <Link
          reloadDocument
          to={valuePage}
          className="block truncate font-mono text-sm font-medium hover:underline"
          title={cacheKey}
        >
          {cacheKey}
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link reloadDocument to={valuePage}>
            <LuExternalLink className="h-4 w-4" />
            View
          </Link>
        </Button>
        <fetcher.Form method="POST">
          <input type="hidden" name="cacheKey" value={cacheKey} />
          <input type="hidden" name="instance" value={instance} />
          <input type="hidden" name="type" value={type} />
          <Button
            size="sm"
            variant={dc.doubleCheck ? 'destructive' : 'secondary'}
            className="gap-2"
            {...dc.getButtonProps({
              type: 'submit',
            })}
          >
            <LuTrash2 className="h-4 w-4" />
            {isDeleting ? 'Deleting...' : dc.doubleCheck ? 'Confirm' : 'Delete'}
          </Button>
        </fetcher.Form>
      </div>
    </div>
  );
};

export const ErrorBoundary = () => {
  return (
    <GeneralErrorBoundary
      statusHandlers={{
        403: ({ error }) => (
          <ErrorFallback
            icon="lock-closed"
            title="You are not allowed to do that"
            description={error?.data?.message}
          />
        ),
      }}
    />
  );
};
