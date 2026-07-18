import { z } from 'zod';

// Shared validator for a contribution/budget amount submitted as an integer
// number of cents (as the group budget editor does). Maps empty/missing input
// to `undefined` (partial update — leave unchanged), coerces the form string,
// and rejects negatives, non-numbers (NaN), and absurd values. Use this instead
// of a bare `z.string()` so malformed input is a 400, never an unhandled 500 or
// a nonsense stored default.
export const MAX_CONTRIBUTION_CENTS = 100_000_00; // $100,000 ceiling

export const optionalContributionCentsSchema = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_CONTRIBUTION_CENTS)
    .optional(),
);
