import { parseWithZod } from '@conform-to/zod';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
const CategoryActionSchema = z.object({
  intent: z.enum(['create', 'rename', 'delete', 'move']),
  id: z.string().optional(),
  name: z.string().optional(),
  direction: z.enum(['up', 'down']).optional(),
  clientMutationId: z.string().optional(),
});
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = parseWithZod(formData, {
    schema: CategoryActionSchema,
  });
  if (submission.status !== 'success') {
    return data(submission.reply(), {
      status: 400,
    });
  }
  const { intent, id, name, direction, clientMutationId } = submission.value;
  const normalizedClientMutationId = clientMutationId?.trim() || null;
  let toast: {
    type: 'success';
    title: string;
    description: string;
  } | null = null;
  let category: {
    id: string;
    name: string;
    order: number;
  } | null = null;
  let deletedCategory: {
    id: string;
    name: string;
    order: number;
  } | null = null;
  switch (intent) {
    case 'create': {
      if (!name)
        return {
          ok: false,
          clientMutationId: normalizedClientMutationId,
        };
      const max = await prisma.wishlistCategory.aggregate({
        where: {
          ownerId: userId,
        },
        _max: {
          order: true,
        },
      });
      const order = (max._max.order ?? -1) + 1;
      category = await prisma.wishlistCategory.create({
        select: {
          id: true,
          name: true,
          order: true,
        },
        data: {
          ownerId: userId,
          name,
          order,
        },
      });
      toast = {
        type: 'success',
        title: 'Category added',
        description: 'Wishlist category added.',
      };
      break;
    }
    case 'rename': {
      if (!id || !name)
        return {
          ok: false,
          clientMutationId: normalizedClientMutationId,
        };
      category = await prisma.wishlistCategory.update({
        select: {
          id: true,
          name: true,
          order: true,
        },
        where: {
          id,
          ownerId: userId,
        },
        data: {
          name,
        },
      });
      break;
    }
    case 'delete': {
      if (!id)
        return {
          ok: false,
          clientMutationId: normalizedClientMutationId,
        };
      const existingCategory = await prisma.wishlistCategory.findFirst({
        select: {
          id: true,
          name: true,
          order: true,
        },
        where: {
          id,
          ownerId: userId,
        },
      });
      if (!existingCategory) {
        return {
          ok: false,
          clientMutationId: normalizedClientMutationId,
        };
      }
      await prisma.wishlistCategory.delete({
        where: {
          id: existingCategory.id,
        },
      });
      deletedCategory = existingCategory;
      break;
    }
    case 'move': {
      if (!id || !direction)
        return {
          ok: false,
          clientMutationId: normalizedClientMutationId,
        };
      const categories = await prisma.wishlistCategory.findMany({
        where: {
          ownerId: userId,
        },
        orderBy: {
          order: 'asc',
        },
      });
      const index = categories.findIndex((c) => c.id === id);
      if (index === -1) break;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= categories.length) break;
      const current = categories[index]!;
      const swap = categories[targetIndex]!;
      await prisma.$transaction([
        prisma.wishlistCategory.update({
          where: {
            id: current.id,
          },
          data: {
            order: swap.order,
          },
        }),
        prisma.wishlistCategory.update({
          where: {
            id: swap.id,
          },
          data: {
            order: current.order,
          },
        }),
      ]);
      category = {
        id: current.id,
        name: current.name,
        order: swap.order,
      };
      break;
    }
  }
  return {
    ok: true,
    intent,
    toast,
    category,
    deletedCategoryId: deletedCategory?.id ?? null,
    deletedCategory,
    clientMutationId: normalizedClientMutationId,
  };
}
