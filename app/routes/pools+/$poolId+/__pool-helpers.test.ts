import { describe, expect, test } from 'vitest'
import { getInitials, getUserDisplayName } from './index.tsx'

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

describe('getInitials', () => {
	test('returns the first two characters uppercased from the name when name is set', () => {
		expect(getInitials({ name: 'Alex Johnson', username: 'alex' })).toBe('AL')
	})

	test('falls back to the username and returns first two chars when name is null', () => {
		expect(getInitials({ name: null, username: 'alex' })).toBe('AL')
	})

	test('handles single-character names and usernames without throwing', () => {
		expect(getInitials({ name: 'Q', username: 'alex' })).toBe('Q')
		expect(getInitials({ name: null, username: 'z' })).toBe('Z')
	})
})
