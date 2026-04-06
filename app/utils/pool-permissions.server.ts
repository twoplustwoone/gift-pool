import { data } from 'react-router'
import { prisma } from '#app/utils/db.server.ts'

// A minimal pool shape — enough for permission checks without fetching
// the entire pool every time.
export type PoolForPermissions = {
	id: string
	organizerId: string
	giftGroupId: string | null
	status: string
}

// ─── Role checks ──────────────────────────────────────────────────────────────

export function isPoolOrganizer(
	userId: string,
	pool: PoolForPermissions,
): boolean {
	return pool.organizerId === userId
}

// Returns true if the user is an OWNER or ADMIN in the pool's parent group.
// Returns false if the pool has no parent group, or the user isn't in it.
export async function isGroupAdminOfPool(
	userId: string,
	pool: PoolForPermissions,
): Promise<boolean> {
	if (!pool.giftGroupId) return false

	const membership = await prisma.usersInGiftGroups.findUnique({
		where: { userId_giftGroupId: { userId, giftGroupId: pool.giftGroupId } },
		select: { role: true },
	})

	return membership?.role === 'OWNER' || membership?.role === 'ADMIN'
}

// The full "can manage this pool" check:
// true if the user is the organizer OR a group admin/owner for the pool's group.
export async function canManagePool(
	userId: string,
	pool: PoolForPermissions,
): Promise<boolean> {
	if (isPoolOrganizer(userId, pool)) return true
	return isGroupAdminOfPool(userId, pool)
}

// Returns true if the user is a contributor in the pool.
export async function isPoolContributor(
	userId: string,
	poolId: string,
): Promise<boolean> {
	const record = await prisma.poolContributor.findUnique({
		where: { poolId_userId: { poolId, userId } },
		select: { id: true },
	})
	return record !== null
}

// ─── Guards (throw on failure) ────────────────────────────────────────────────

// Throws 403 if the user is not a contributor in the pool.
export async function requirePoolContributor(
	userId: string,
	poolId: string,
): Promise<void> {
	const ok = await isPoolContributor(userId, poolId)
	if (!ok) {
		throw data({ error: 'You are not a contributor in this pool.' }, { status: 403 })
	}
}

// Throws 403 if the user cannot manage the pool.
export async function requireCanManagePool(
	userId: string,
	pool: PoolForPermissions,
): Promise<void> {
	const ok = await canManagePool(userId, pool)
	if (!ok) {
		throw data(
			{ error: 'Only the pool organizer or a group admin can do this.' },
			{ status: 403 },
		)
	}
}

// Throws 403 if the user is not the pool organizer (strict — does not grant
// access to group admins). Use for actions that only the creator should do,
// e.g. deleting the pool.
export function requirePoolOrganizer(
	userId: string,
	pool: PoolForPermissions,
): void {
	if (!isPoolOrganizer(userId, pool)) {
		throw data(
			{ error: 'Only the pool organizer can do this.' },
			{ status: 403 },
		)
	}
}

// Throws 404 if the pool doesn't exist or the user isn't a contributor.
// Use in loaders to protect pool detail pages.
export async function requirePoolVisible(
	userId: string,
	poolId: string,
): Promise<void> {
	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: { id: true },
	})
	if (!pool) {
		throw data({ error: 'Pool not found.' }, { status: 404 })
	}
	await requirePoolContributor(userId, poolId)
}
