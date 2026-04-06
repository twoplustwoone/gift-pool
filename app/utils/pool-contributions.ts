// Pure contribution calculation logic — no DB access, fully testable.
//
// Algorithm: "lowest budget first"
//   Sort contributors ascending by max contribution. Iterate through them.
//   At each step, divide remaining cost equally among remaining contributors.
//   If a contributor's max is less than their equal share, they pay their max
//   and step out. The remainder falls to those with more room. The last
//   (highest-budget) contributor absorbs any rounding difference.
//
// Examples (from the original design spec):
//   A=3000, B=2000, C=1000 cents, gift costs 5000 → C=1000, B=2000, A=2000
//   A=3000, B=2000, C=1000 cents, gift costs 5500 → C=1000, B=2000, A=2500

export type ContributorBudget = {
	userId: string
	maxCents: number
}

export type ContributionBreakdown = {
	userId: string
	owedCents: number // what this contributor owes the purchaser
}

export type ContributionResult = {
	breakdown: ContributionBreakdown[]
	totalAvailableCents: number
	shortfallCents: number // > 0 means the gift is over the collective budget
	surplusCents: number // > 0 means contributors have leftover room
}

export function calculateContributions(
	contributors: ContributorBudget[],
	finalPriceCents: number,
): ContributionResult {
	const totalAvailableCents = contributors.reduce(
		(sum, c) => sum + c.maxCents,
		0,
	)

	if (contributors.length === 0) {
		return {
			breakdown: [],
			totalAvailableCents: 0,
			shortfallCents: finalPriceCents,
			surplusCents: 0,
		}
	}

	// Sort ascending — smallest budgets pay their max first
	const sorted = [...contributors].sort((a, b) => a.maxCents - b.maxCents)

	const breakdown: ContributionBreakdown[] = []
	let remaining = finalPriceCents

	for (let i = 0; i < sorted.length; i++) {
		const contributor = sorted[i]
		if (!contributor) continue

		const isLast = i === sorted.length - 1

		let owedCents: number

		if (isLast) {
			// Last contributor pays whatever's left, capped at their max.
			// This absorbs any rounding and ensures the sum is exact.
			owedCents = Math.min(contributor.maxCents, Math.max(0, remaining))
		} else {
			const remainingContributors = sorted.length - i
			// Floor division — the last contributor absorbs any leftover cents
			const equalShare = Math.floor(remaining / remainingContributors)
			owedCents = Math.min(contributor.maxCents, equalShare)
		}

		breakdown.push({ userId: contributor.userId, owedCents })
		remaining -= owedCents
	}

	const shortfallCents = Math.max(0, remaining)
	const paidTotal = breakdown.reduce((sum, b) => sum + b.owedCents, 0)
	const surplusCents = Math.max(0, totalAvailableCents - paidTotal)

	return { breakdown, totalAvailableCents, shortfallCents, surplusCents }
}

// Format cents as a display string (e.g. 2500 → "$25.00")
export function formatCents(cents: number, currency = 'USD'): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		minimumFractionDigits: 2,
	}).format(cents / 100)
}
