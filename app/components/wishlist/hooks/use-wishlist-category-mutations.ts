import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { useFetchers } from 'react-router';

import {
  applyPendingCategoryMutations,
  applySettledCategoryMutations,
  type CategoryMutationResult,
  type PendingCategoryMutation,
  pruneSatisfiedSettledCategoryMutations,
  type WishlistCategory,
} from '../wishlist-category-state';
import { getFormString, normalizeFormActionPath, normalizeNullableFormValue } from '../wishlist-item-state';

export const useWishlistCategoryMutations = ({
  orderedCategories,
  setOrderedCategories,
  serverCategories,
}: {
  orderedCategories: WishlistCategory[];
  setOrderedCategories: Dispatch<SetStateAction<WishlistCategory[]>>;
  serverCategories: WishlistCategory[];
}) => {
  const pendingFetchers = useFetchers();

  const [settledCategoryMutations, setSettledCategoryMutations] = useState<
    Map<string, CategoryMutationResult>
  >(new Map());

  const pendingCategoryMutations = useMemo<PendingCategoryMutation[]>(() => {
    return pendingFetchers.reduce<PendingCategoryMutation[]>(
      (mutations, fetcher, index) => {
        if (!fetcher.formData) return mutations;
        if (
          normalizeFormActionPath(fetcher.formAction) !== '/wishlist/categories'
        ) {
          return mutations;
        }

        const intent = getFormString(fetcher.formData, 'intent');
        const clientMutationId =
          normalizeNullableFormValue(
            getFormString(fetcher.formData, 'clientMutationId'),
          ) ?? `fetcher-category-${index}`;

        if (intent === 'create') {
          const name = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'name'),
          );
          if (!name) return mutations;
          mutations.push({
            type: 'create',
            clientMutationId,
            name,
            order: orderedCategories.length,
          });
          return mutations;
        }

        if (intent === 'rename') {
          const categoryId = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'id'),
          );
          const name = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'name'),
          );
          if (!categoryId || !name) return mutations;
          mutations.push({
            type: 'rename',
            clientMutationId,
            categoryId,
            name,
          });
          return mutations;
        }

        if (intent === 'delete') {
          const categoryId = normalizeNullableFormValue(
            getFormString(fetcher.formData, 'id'),
          );
          if (!categoryId) return mutations;
          mutations.push({
            type: 'delete',
            clientMutationId,
            categoryId,
          });
          return mutations;
        }

        return mutations;
      },
      [],
    );
  }, [orderedCategories.length, pendingFetchers]);

  const settledCategoryMutationList = useMemo(
    () => [...settledCategoryMutations.values()],
    [settledCategoryMutations],
  );

  const optimisticCategories = useMemo(
    () =>
      applyPendingCategoryMutations({
        categories: applySettledCategoryMutations({
          categories: orderedCategories,
          settledMutations: settledCategoryMutationList,
        }),
        pendingMutations: pendingCategoryMutations,
        // A create whose result has already settled is represented by its real
        // category; skip its optimistic placeholder so it doesn't render twice.
        settledClientMutationIds: new Set(settledCategoryMutations.keys()),
      }),
    [
      orderedCategories,
      pendingCategoryMutations,
      settledCategoryMutationList,
      settledCategoryMutations,
    ],
  );

  const handleCategoryMutationResult = useCallback(
    (result: CategoryMutationResult) => {
      if (!result.ok || !result.clientMutationId) return;
      const mutationId = result.clientMutationId;

      const affectedCategoryId =
        result.category?.id ?? result.deletedCategoryId;
      setSettledCategoryMutations((previousMutations) => {
        const nextMutations = new Map<string, CategoryMutationResult>();

        for (const [clientMutationId, previousResult] of previousMutations) {
          const previousAffectedCategoryId =
            previousResult.category?.id ?? previousResult.deletedCategoryId;
          if (
            affectedCategoryId &&
            previousAffectedCategoryId === affectedCategoryId
          ) {
            continue;
          }

          nextMutations.set(clientMutationId, previousResult);
        }

        nextMutations.set(mutationId, result);
        return nextMutations;
      });
    },
    [],
  );

  // Sync ordered categories and prune settled mutations when server data changes
  useEffect(() => {
    const nextServerCategories = [...serverCategories].sort(
      (a, b) => a.order - b.order,
    );
    setOrderedCategories(nextServerCategories);
    setSettledCategoryMutations((currentMutations) => {
      const nextMutations = pruneSatisfiedSettledCategoryMutations({
        serverCategories: nextServerCategories,
        settledMutations: [...currentMutations.values()],
      });
      return new Map(
        nextMutations.map((mutation) => [mutation.clientMutationId!, mutation]),
      );
    });
  }, [serverCategories, setOrderedCategories]);

  return {
    optimisticCategories,
    pendingCategoryMutations,
    handleCategoryMutationResult,
  };
};
