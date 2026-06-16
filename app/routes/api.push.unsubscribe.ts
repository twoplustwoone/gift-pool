import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return data({ error: 'Invalid endpoint' }, { status: 400 });
  }

  // Scope the delete to this user's own subscriptions so one account can't
  // remove another's by guessing an endpoint.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId },
  });

  return data({ success: true });
}
