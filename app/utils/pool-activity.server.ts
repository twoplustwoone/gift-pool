import { prisma } from '#app/utils/db.server.ts'
import type { PoolActivityType } from '#app/utils/pool-constants.ts'

// Fire-and-forget activity logging — errors are swallowed so a logging
// failure never breaks a user action.
export async function logPoolActivity(
	poolId: string,
	type: PoolActivityType,
	options: {
		actorId?: string
		payload?: Record<string, unknown>
	} = {},
): Promise<void> {
	try {
		await prisma.poolActivity.create({
			data: {
				poolId,
				actorId: options.actorId ?? null,
				type,
				payload: options.payload ? JSON.stringify(options.payload) : null,
			},
		})
	} catch {
		// Intentionally swallowed — activity log failures must never surface to users
	}
}
