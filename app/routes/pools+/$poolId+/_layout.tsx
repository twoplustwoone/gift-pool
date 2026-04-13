import { LuGift } from 'react-icons/lu'
import { Outlet, useLoaderData } from 'react-router'
import { PageHeader } from '#app/components/page-header.tsx'
import { Stack } from '#app/components/ui-kit'
import {
	POOL_STATUS_LABELS,
	OCCASION_TYPE_LABELS,
	type PoolStatus,
	type OccasionType,
} from '#app/utils/pool-constants.ts'
import { type loader as routeLoader } from './__route.server'

export { loader, action } from './__route.server'

const statusColors: Record<PoolStatus, string> = {
	OPEN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
	VOTING: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
	DECIDED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
	PURCHASED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
	DELIVERED: 'bg-muted text-muted-foreground',
	CANCELLED: 'bg-muted text-muted-foreground line-through',
}

const PoolLayout = () => {
	const { pool } = useLoaderData<typeof routeLoader>()

	const status = pool.status as PoolStatus
	const occasion = pool.occasionType as OccasionType

	const recipientLabel =
		pool.recipientName ??
		pool.recipientUser?.name ??
		pool.recipientUser?.username ??
		'Someone special'

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader
				variant="detail"
				back={{ label: 'Pools', href: '/pools' }}
				icon={<LuGift size={22} className="shrink-0 text-primary" />}
				title={pool.title}
				subtitle={`${OCCASION_TYPE_LABELS[occasion]} for ${recipientLabel}`}
			>
				<span
					className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}
				>
					{POOL_STATUS_LABELS[status]}
				</span>
			</PageHeader>

			{/* Content */}
			<main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				<div className="mx-auto max-w-6xl p-3 sm:p-6">
					<Stack gap={6}>
						<Outlet />
					</Stack>
				</div>
			</main>
		</div>
	)
}

export default PoolLayout
