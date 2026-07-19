// Privacy projections for pool data at the loader boundary (ADR 0001,
// handoff §6.5/§9): components receive only what the current viewer may
// render. Contribution Limits are private to their owner; contributors share
// the aggregate Available Budget; a Pool Manager may see that a limit is
// missing but never the amount; Contribution Shares and Received status are
// visible only between the purchaser and each individual contributor.

type ContributorUser = {
  id: string;
  username: string;
  name: string | null;
  image: { id: string; altText: string | null } | null;
};

type RawContributor = {
  userId: string;
  contributionCents: number | null;
  hasPaid: boolean;
  joinedAt: Date;
  user: ContributorUser;
};

export type ProjectedContributor = {
  userId: string;
  joinedAt: Date;
  user: ContributorUser;
  // Managers see whether a limit is missing (never the amount); everyone
  // else gets null — the field carries no information for peers.
  hasSetLimit: boolean | null;
};

export function projectPoolContributors({
  contributors,
  canManage,
}: {
  contributors: RawContributor[];
  canManage: boolean;
}): {
  contributors: ProjectedContributor[];
  availableBudgetCents: number;
  limitsSetCount: number;
} {
  return {
    contributors: contributors.map((c) => ({
      userId: c.userId,
      joinedAt: c.joinedAt,
      user: c.user,
      hasSetLimit: canManage ? c.contributionCents !== null : null,
    })),
    availableBudgetCents: contributors.reduce(
      (sum, c) => sum + (c.contributionCents ?? 0),
      0,
    ),
    limitsSetCount: contributors.filter((c) => c.contributionCents !== null)
      .length,
  };
}

type FullBreakdown = {
  breakdown: Array<{
    userId: string;
    owedCents: number;
    hasPaid: boolean;
    user: ContributorUser;
  }>;
  shortfallCents: number;
  totalCoveredCents?: number;
};

export type ViewerContributionBreakdown =
  | ({ kind: 'purchaser' } & FullBreakdown)
  | {
      // Non-purchasers (including non-purchasing managers) see their own
      // share and status only, plus aggregates that identify no one.
      kind: 'contributor';
      viewerShare: { owedCents: number; hasPaid: boolean } | null;
      shortfallCents: number;
      allReceived: boolean;
    };

export function projectContributionBreakdown(
  full: FullBreakdown | null,
  viewerId: string,
  purchaserId: string | null,
): ViewerContributionBreakdown | null {
  if (!full) return null;
  if (purchaserId === viewerId) {
    return { kind: 'purchaser', ...full };
  }
  const own = full.breakdown.find((b) => b.userId === viewerId) ?? null;
  return {
    kind: 'contributor',
    viewerShare: own
      ? { owedCents: own.owedCents, hasPaid: own.hasPaid }
      : null,
    shortfallCents: full.shortfallCents,
    allReceived: full.breakdown.every((b) => b.hasPaid),
  };
}
