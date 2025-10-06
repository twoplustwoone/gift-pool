import { parseWithZod } from '@conform-to/zod';
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';

const CategoryActionSchema = z.object({
  intent: z.enum(['create', 'rename', 'delete', 'move']),
  id: z.string().optional(),
  name: z.string().optional(),
  direction: z.enum(['up', 'down']).optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: CategoryActionSchema });

  if (submission.status !== 'success') {
    return json(submission.reply(), { status: 400 });
  }

  const { intent, id, name, direction } = submission.value;

  let toast: { type: 'success'; title: string; description: string } | null =
    null;

  switch (intent) {
    case 'create': {
      if (!name) return json({ ok: false });
      const max = await prisma.wishlistCategory.aggregate({
        where: { ownerId: userId },
        _max: { order: true },
      });
      const order = (max._max.order ?? -1) + 1;
      await prisma.wishlistCategory.create({
        data: { ownerId: userId, name, order },
      });
      toast = {
        type: 'success',
        title: 'Category added',
        description: 'Wishlist category added.',
      };
      break;
    }
    case 'rename': {
      if (!id || !name) return json({ ok: false });
      await prisma.wishlistCategory.update({
        where: { id },
        data: { name },
      });
      break;
    }
    case 'delete': {
      if (!id) return json({ ok: false });
      await prisma.wishlistCategory.delete({ where: { id } });
      break;
    }
    case 'move': {
      if (!id || !direction) return json({ ok: false });
      const categories = await prisma.wishlistCategory.findMany({
        where: { ownerId: userId },
        orderBy: { order: 'asc' },
      });
      const index = categories.findIndex((c) => c.id === id);
      if (index === -1) break;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= categories.length) break;
      const current = categories[index]!;
      const swap = categories[targetIndex]!;
      await prisma.$transaction([
        prisma.wishlistCategory.update({
          where: { id: current.id },
          data: { order: swap.order },
        }),
        prisma.wishlistCategory.update({
          where: { id: swap.id },
          data: { order: current.order },
        }),
      ]);
      break;
    }
  }

  return json({ ok: true, toast });
}
