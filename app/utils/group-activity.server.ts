import { prisma } from './db.server';

export async function logGroupActivity(
  giftGroupId: string,
  actorId: string,
  type: string,
  payload: unknown = {},
) {
  try {
    await prisma.groupActivity.create({
      data: {
        giftGroupId,
        actorId,
        type,
        payload: JSON.stringify(payload ?? {}),
      },
    });
  } catch (e) {
    // Best effort logging; swallow errors
  }
}
