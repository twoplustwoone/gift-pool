export type WishlistCategory = { id: string; name: string; order: number };

// Placeholder id for a category created optimistically, before the server
// has assigned it a real id. Never a valid target for a mutation that
// requires an owned, persisted category (e.g. moving an item into it) —
// the create request may still be in flight or may fail.
const OPTIMISTIC_CATEGORY_PREFIX = 'optimistic-category:';
export const isOptimisticCategoryId = (categoryId: string) =>
  categoryId.startsWith(OPTIMISTIC_CATEGORY_PREFIX);

export type CategoryMutationResult = {
  ok?: boolean;
  intent?: 'create' | 'rename' | 'delete' | 'move';
  category?: WishlistCategory | null;
  deletedCategoryId?: string | null;
  clientMutationId?: string | null;
  toast?: unknown;
};

export type PendingCategoryMutation =
  | {
      type: 'create';
      clientMutationId: string;
      name: string;
      order: number;
    }
  | {
      type: 'rename';
      clientMutationId: string;
      categoryId: string;
      name: string;
    }
  | {
      type: 'delete';
      clientMutationId: string;
      categoryId: string;
    };

const sortAndRedensifyCategories = (categories: WishlistCategory[]) =>
  [...categories]
    .sort((a, b) => a.order - b.order)
    .map((category, index) => ({ ...category, order: index }));

export const applyPendingCategoryMutations = ({
  categories,
  pendingMutations,
  settledClientMutationIds,
}: {
  categories: WishlistCategory[];
  pendingMutations: PendingCategoryMutation[];
  // clientMutationIds of creates that already returned a server result. Their
  // real category is present via applySettledCategoryMutations, so re-inserting
  // the optimistic placeholder here would render the category twice during the
  // window before loader revalidation prunes the settled mutation.
  settledClientMutationIds?: ReadonlySet<string>;
}) => {
  let next = [...categories];

  for (const mutation of pendingMutations) {
    if (mutation.type === 'create') {
      if (settledClientMutationIds?.has(mutation.clientMutationId)) continue;
      const optimisticId = `${OPTIMISTIC_CATEGORY_PREFIX}${mutation.clientMutationId}`;
      if (next.some((category) => category.id === optimisticId)) continue;
      next.push({
        id: optimisticId,
        name: mutation.name,
        order: mutation.order,
      });
      continue;
    }

    if (mutation.type === 'rename') {
      next = next.map((category) =>
        category.id === mutation.categoryId
          ? { ...category, name: mutation.name }
          : category,
      );
      continue;
    }

    next = next.filter((category) => category.id !== mutation.categoryId);
  }

  return sortAndRedensifyCategories(next);
};

export const applySettledCategoryMutations = ({
  categories,
  settledMutations,
}: {
  categories: WishlistCategory[];
  settledMutations: CategoryMutationResult[];
}) => {
  const nextCategories = new Map(
    categories.map((category) => [category.id, category]),
  );

  for (const mutation of settledMutations) {
    if (!mutation.ok) continue;

    if (mutation.deletedCategoryId) {
      nextCategories.delete(mutation.deletedCategoryId);
    }

    if (mutation.category) {
      nextCategories.set(mutation.category.id, mutation.category);
    }
  }

  return sortAndRedensifyCategories([...nextCategories.values()]);
};

export const isSettledCategoryMutationSatisfiedByServer = ({
  serverCategories,
  mutation,
}: {
  serverCategories: WishlistCategory[];
  mutation: CategoryMutationResult;
}) => {
  if (!mutation.ok) return true;

  if (mutation.intent === 'create') {
    return mutation.category
      ? serverCategories.some(
          (category) => category.id === mutation.category?.id,
        )
      : false;
  }

  if (mutation.intent === 'rename') {
    if (!mutation.category) return false;
    const serverCategory = serverCategories.find(
      (category) => category.id === mutation.category?.id,
    );
    return serverCategory?.name === mutation.category.name;
  }

  if (mutation.intent === 'delete') {
    return mutation.deletedCategoryId
      ? !serverCategories.some(
          (category) => category.id === mutation.deletedCategoryId,
        )
      : false;
  }

  if (mutation.intent === 'move') {
    if (!mutation.category) return false;
    const serverCategory = serverCategories.find(
      (category) => category.id === mutation.category?.id,
    );
    return serverCategory?.order === mutation.category.order;
  }

  return false;
};

export const pruneSatisfiedSettledCategoryMutations = ({
  serverCategories,
  settledMutations,
}: {
  serverCategories: WishlistCategory[];
  settledMutations: CategoryMutationResult[];
}) =>
  settledMutations.filter(
    (mutation) =>
      !isSettledCategoryMutationSatisfiedByServer({
        serverCategories,
        mutation,
      }),
  );
