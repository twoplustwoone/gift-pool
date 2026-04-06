import { LuGift } from 'react-icons/lu'
import { Link, Outlet, useLoaderData } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Flex, Stack, Text } from '#app/components/ui-kit'
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
			{/* Header */}
			<div className="w-full border-b bg-surface backdrop-blur">
				<div className="mx-auto max-w-3xl px-3 py-3 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<Button asChild variant="ghost" size="sm" className="shrink-0 px-2">
								<Link to="/pools">
									<Icon name="arrow-left" className="mr-1" /> Pools
								</Link>
							</Button>
							<div className="flex min-w-0 items-center gap-3">
								<LuGift size={22} className="shrink-0 text-primary" />
								<div className="min-w-0 leading-tight">
									<div className="truncate text-base font-extrabold sm:text-lg">
										{pool.title}
									</div>
									<div className="text-sm text-muted-foreground">
										{OCCASION_TYPE_LABELS[occasion]} for{' '}
										<span className="font-medium text-foreground">
											{recipientLabel}
										</span>
									</div>
								</div>
							</div>
						</div>
						<span
							className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}
						>
							{POOL_STATUS_LABELS[status]}
						</span>
					</div>
				</div>
			</div>

			{/* Content */}
			<main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				<div className="mx-auto max-w-3xl p-3 sm:p-6">
					<Stack gap={6}>
						<Outlet />
					</Stack>
				</div>
			</main>
		</div>
	)
}

export default PoolLayout
