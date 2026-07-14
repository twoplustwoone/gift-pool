import { LuGift, LuSettings, LuUsers } from 'react-icons/lu'
import { Link, Outlet, useLoaderData } from 'react-router'
import {
	ContextNotificationAwarenessNotice,
	ContextNotificationControl,
} from '#app/components/notifications/context-notification-controls.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Stack, Text } from '#app/components/ui-kit'
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
	const { pool, canManage, notificationAwareness, notificationTopics } =
		useLoaderData<typeof routeLoader>()

	const status = pool.status as PoolStatus
	const occasion = pool.occasionType as OccasionType

	const recipientLabel =
		pool.recipientName ??
		pool.recipientUser?.name ??
		pool.recipientUser?.username ??
		'Someone special'

	const back = pool.giftGroup
		? { label: pool.giftGroup.name, href: `/groups/${pool.giftGroup.id}` }
		: { label: 'Pools', href: '/pools' }

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader
				variant="detail"
				back={back}
				icon={<LuGift size={22} className="shrink-0 text-primary" />}
				title={pool.title}
				subtitle={`${OCCASION_TYPE_LABELS[occasion]} for ${recipientLabel}`}
			>
				<div className="flex shrink-0 items-center gap-2">
					<span
						className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}
					>
						{POOL_STATUS_LABELS[status]}
					</span>
					<ContextNotificationControl
						context={{ kind: 'POOL', poolId: pool.id }}
						contextLabel={pool.title}
						awareness={notificationAwareness}
						availableTopics={notificationTopics}
						inheritedFromLabel={pool.giftGroup?.name}
					/>
					{canManage && (
						<Link
							to="settings"
							aria-label="Pool settings"
							className="text-muted-foreground hover:text-foreground"
						>
							<LuSettings className="h-5 w-5" />
						</Link>
					)}
				</div>
			</PageHeader>

			{/* Content */}
			<main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				<div className="mx-auto max-w-6xl p-3 sm:p-6">
					<Stack gap={6}>
						<ContextNotificationAwarenessNotice
							context={{ kind: 'POOL', poolId: pool.id }}
							contextLabel={pool.title}
							awareness={notificationAwareness}
							inheritedFromLabel={pool.giftGroup?.name}
						/>
						{pool.giftGroup && (
							<Link
								to={`/groups/${pool.giftGroup.id}`}
								className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
							>
								<LuUsers size={12} />
								<Text size="xs">In group</Text>
								<Text size="xs" weight="medium" className="text-foreground">
									{pool.giftGroup.name}
								</Text>
							</Link>
						)}
						<Outlet />
					</Stack>
				</div>
			</main>
		</div>
	)
}

export default PoolLayout
