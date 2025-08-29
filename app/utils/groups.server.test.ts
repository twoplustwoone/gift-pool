import { beforeEach, expect, test } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';
import { removeUserFromGroup } from '#app/utils/groups.server.ts';
import { cleanupDb } from '#tests/db-utils.ts';

beforeEach(async () => {
  await cleanupDb(prisma);
});

test('removeUserFromGroup marks membership as removed', async () => {
  const actor = await prisma.user.create({ data: { email: 'a@a.com', username: 'actor', } });
  const member = await prisma.user.create({ data: { email: 'b@b.com', username: 'member', } });
  const group = await prisma.giftGroup.create({ data: { name: 'group', description: 'desc' } });
  await prisma.usersInGiftGroups.create({
    data: {
      userId: member.id,
      giftGroupId: group.id,
      role: 'member',
    },
  });
  await removeUserFromGroup({
    targetUserId: member.id,
    groupId: group.id,
    actorId: actor.id,
    reason: 'testing',
  });
  const record = await prisma.usersInGiftGroups.findUniqueOrThrow({
    where: { userId_giftGroupId: { userId: member.id, giftGroupId: group.id } },
  });
  expect(record.removedAt).toBeTruthy();
  expect(record.removedById).toBe(actor.id);
  expect(record.removedReason).toBe('testing');
});
