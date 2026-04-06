import { z } from 'zod'
import { describe, expect, test } from 'vitest'
import { dollarsToCents } from '#app/utils/price.ts'

const DollarsToCentsSchema = z.coerce.number().min(0).transform(dollarsToCents)

describe('dollars-to-cents transform (used by UpdateFinalPriceSchema, UpdateContributionSchema, ProposeIdeaSchema)', () => {
	test('converts common decimal dollar values to cents', () => {
		expect(dollarsToCents(9.99)).toBe(999)
		expect(dollarsToCents(80.0)).toBe(8000)
		expect(dollarsToCents(0.01)).toBe(1)
		expect(dollarsToCents(0.0)).toBe(0)
	})

	test('handles the 1.005 floating-point edge case as 101 cents', () => {
		expect(dollarsToCents(1.005)).toBe(101)
	})

	test('coerces string inputs before converting to cents', () => {
		expect(DollarsToCentsSchema.parse('1')).toBe(100)
		expect(DollarsToCentsSchema.parse('30.00')).toBe(3000)
		expect(DollarsToCentsSchema.parse('0')).toBe(0)
	})
})
