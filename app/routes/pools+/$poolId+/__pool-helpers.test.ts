import { describe, expect, test } from 'vitest'
import { getUserDisplayName } from './index.tsx'

describe('getUserDisplayName', () => {
	test('returns the user name when name is non-null and non-empty', () => {
		expect(
			getUserDisplayName({ name: 'Alex Johnson', username: 'alex' }),
		).toBe('Alex Johnson')
	})

	test('returns @username when name is null', () => {
		expect(getUserDisplayName({ name: null, username: 'alex' })).toBe('@alex')
	})

	test('returns @username when name is an empty string', () => {
		expect(getUserDisplayName({ name: '', username: 'alex' })).toBe('@alex')
	})
})
