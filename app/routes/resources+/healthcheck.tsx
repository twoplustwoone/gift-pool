// learn more: https://fly.io/docs/reference/configuration/#services-http_checks
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '#app/utils/db.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  const host =
    request.headers.get('X-Forwarded-Host') ?? request.headers.get('host');

  try {
    // If we can round-trip a query against Prisma and make a HEAD request
    // to ourselves, then we're good. `SELECT 1` is enough to confirm the
    // Prisma connection + LiteFS path are alive — we previously used
    // `prisma.user.count()` here, but that issues a full `SELECT COUNT(*)`
    // over the User table on every probe (every 10s per http_check, two
    // checks defined in fly.toml). At boot it was measuring ~106ms per
    // run and only grows with the table, so we swap to a literal.
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      fetch(`${new URL(request.url).protocol}${host}`, {
        method: 'HEAD',
        headers: { 'X-Healthcheck': 'true' },
      }).then((r) => {
        if (!r.ok) throw r;
      }),
    ]);
    return new Response('OK');
  } catch (error: unknown) {
    console.log('healthcheck ❌', { error });
    return new Response('ERROR', { status: 500 });
  }
}
