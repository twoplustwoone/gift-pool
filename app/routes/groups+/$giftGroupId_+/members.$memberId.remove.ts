import { json, type ActionFunctionArgs } from '@remix-run/node';
import { z } from 'zod';
import { requireUserWithGroupPermission } from '#app/utils/group-permissions.server.ts';
import { removeUserFromGroup } from '#app/utils/groups.server.ts';

const schema = z.object({ reason: z.string().max(255).optional() });

export async function action({ params, request }: ActionFunctionArgs) {
  const groupId = params.giftGroupId;
  const memberId = params.memberId;
  if (!groupId || !memberId) {
    throw json({ error: 'Invalid path parameters' }, { status: 400 });
  }

  const actorId = await requireUserWithGroupPermission(
    request,
    groupId,
    'removeMember',
  );

  const formData = Object.fromEntries(await request.formData());
  const parse = schema.safeParse(formData);
  if (!parse.success) {
    throw json({ error: 'Invalid data' }, { status: 400 });
  }

  await removeUserFromGroup({
    targetUserId: memberId,
    groupId,
    actorId,
    reason: parse.data.reason,
  });

  return json({ ok: true });
}
