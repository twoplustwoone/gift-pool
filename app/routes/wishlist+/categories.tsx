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

type CategoryMutationResult = {
  category: { id: string; name: string; order: number } | null;
  deletedCategory: { id: string; name: string; order: number } | null;
  toast: {
    type: 'success';
    title: string;
    description: string;
  } | null;
};

function invalidCategoryMutation(clientMutationId: string | null) {
  return {
    ok: false,
    clientMutationId,
  };
}

async function createCategory({
  name,
  userId,
}: {
  name: string;
  userId: string;
}): Promise<CategoryMutationResult> {
  const max = await prisma.wishlistCategory.aggregate({
    where: {
      ownerId: userId,
    },
    _max: {
      order: true,
    },
  });
  const order = (max._max.order ?? -1) + 1;
  const category = await prisma.wishlistCategory.create({
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

  return {
    category,
    deletedCategory: null,
    toast: {
      type: 'success',
      title: 'Category added',
      description: 'Wishlist category added.',
    },
  };
}

async function renameCategory({
  id,
  name,
  userId,
}: {
  id: string;
  name: string;
  userId: string;
}): Promise<CategoryMutationResult> {
  const category = await prisma.wishlistCategory.update({
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

  return {
    category,
    deletedCategory: null,
    toast: null,
  };
}

async function deleteCategory({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<CategoryMutationResult | null> {
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
  if (!existingCategory) return null;

  await prisma.wishlistCategory.delete({
    where: {
      id: existingCategory.id,
    },
  });

  return {
    category: null,
    deletedCategory: existingCategory,
    toast: null,
  };
}

async function moveCategory({
  direction,
  id,
  userId,
}: {
  direction: 'up' | 'down';
  id: string;
  userId: string;
}): Promise<CategoryMutationResult> {
  const categories = await prisma.wishlistCategory.findMany({
    where: {
      ownerId: userId,
    },
    orderBy: {
      order: 'asc',
    },
  });
  const index = categories.findIndex((category) => category.id === id);
  if (index === -1) {
    return {
      category: null,
      deletedCategory: null,
      toast: null,
    };
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= categories.length) {
    return {
      category: null,
      deletedCategory: null,
      toast: null,
    };
  }

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

  return {
    category: {
      id: current.id,
      name: current.name,
      order: swap.order,
    },
    deletedCategory: null,
    toast: null,
  };
}

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
  let result: CategoryMutationResult | null = null;
  if (intent === 'create') {
    if (!name) return invalidCategoryMutation(normalizedClientMutationId);
    result = await createCategory({ name, userId });
  }
  if (intent === 'rename') {
    if (!id || !name) return invalidCategoryMutation(normalizedClientMutationId);
    result = await renameCategory({ id, name, userId });
  }
  if (intent === 'delete') {
    if (!id) return invalidCategoryMutation(normalizedClientMutationId);
    result = await deleteCategory({ id, userId });
    if (!result) return invalidCategoryMutation(normalizedClientMutationId);
  }
  if (intent === 'move') {
    if (!id || !direction) {
      return invalidCategoryMutation(normalizedClientMutationId);
    }
    result = await moveCategory({ direction, id, userId });
  }

  return {
    ok: true,
    intent,
    toast: result?.toast ?? null,
    category: result?.category ?? null,
    deletedCategoryId: result?.deletedCategory?.id ?? null,
    deletedCategory: result?.deletedCategory ?? null,
    clientMutationId: normalizedClientMutationId,
  };
}
