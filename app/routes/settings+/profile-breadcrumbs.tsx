import { useMemo, type ReactNode } from 'react';
import { useMatches } from 'react-router';
import { z } from 'zod';

export const BreadcrumbHandle = z.object({ breadcrumb: z.any() });
export type BreadcrumbHandle = z.infer<typeof BreadcrumbHandle>;

const BreadcrumbHandleMatch = z.object({
  handle: BreadcrumbHandle,
});

export const useProfileBreadcrumbs = () => {
  const matches = useMatches();

  return useMemo(
    () =>
      matches
        .map((match) => {
          const result = BreadcrumbHandleMatch.safeParse(match);
          if (!result.success || !result.data.handle.breadcrumb) return null;
          return {
            id: match.id,
            to: match.pathname,
            content: result.data.handle.breadcrumb,
          };
        })
        .filter(Boolean) as { id: string; to: string; content: ReactNode }[],
    [matches],
  );
};
