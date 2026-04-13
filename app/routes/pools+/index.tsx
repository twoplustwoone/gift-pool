import { useState } from 'react'
import { LuGift, LuPlus } from 'react-icons/lu'
import { Link, type LoaderFunctionArgs, useLoaderData } from 'react-router'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Flex, Stack, Text } from '#app/components/ui-kit'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatAbsoluteDate } from '#app/utils/dates.ts'
import { prisma } from '#app/utils/db.server.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	POOL_STATUS,
	POOL_STATUS_LABELS,
	OCCASION_TYPE_LABELS,
	type PoolStatus,
	type OccasionType,
} from '#app/utils/pool-constants.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)

	const pools = await prisma.pool.findMany({
		where: {
			contributors: { some: { userId } },
		},
		select: {
			id: true,
			title: true,
			occasionType: true,
			eventDate: true,
			status: true,
			recipientName: true,
			recipientUser: { select: { name: true, username: true } },
			organizer: { select: { id: true } },
			giftGroup: { select: { id: true, name: true } },
			_count: { select: { contributors: true, ideas: true } },
		},
		orderBy: { eventDate: 'asc' },
	})

	// Split into active and completed
	const completedStatuses = new Set<PoolStatus>([
		POOL_STATUS.DELIVERED,
		POOL_STATUS.CANCELLED,
	])
	const active = pools.filter(
		p => !completedStatuses.has(p.status as PoolStatus),
	)
	const completed = pools.filter(p =>
		completedStatuses.has(p.status as PoolStatus),
	)

	return { active, completed, userId }
}

const statusColors: Record<PoolStatus, string> = {
	OPEN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
	VOTING: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
	DECIDED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
	PURCHASED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
	DELIVERED: 'bg-muted text-muted-foreground',
	CANCELLED: 'bg-muted text-muted-foreground',
}

type Pool = Awaited<ReturnType<typeof loader>>['active'][number]

const PoolCard = ({ pool }: { pool: Pool }) => {
	const recipientLabel =
		pool.recipientName ??
		pool.recipientUser?.name ??
		pool.recipientUser?.username ??
		'Someone special'

	const status = pool.status as PoolStatus
	const occasion = pool.occasionType as OccasionType

	return (
		<Link to={`/pools/${pool.id}`} className="block">
			<Card className="group cursor-pointer p-4 transition-shadow hover:shadow-md">
				<Flex justify="between" align="start" gap={3}>
					<Stack gap={1} className="min-w-0 flex-1">
						<Text weight="semibold" className="truncate">
							{pool.title}
						</Text>
						<Text size="sm" className="text-muted-foreground">
							{OCCASION_TYPE_LABELS[occasion]} for{' '}
							<span className="font-medium text-foreground">{recipientLabel}</span>
						</Text>
						{pool.eventDate && (
							<Text size="xs" className="text-muted-foreground">
								{formatAbsoluteDate(pool.eventDate)}
							</Text>
						)}
						<Flex gap={2} align="center" className="mt-1">
							<Text size="xs" className="text-muted-foreground">
								{pool._count.contributors}{' '}
								{pool._count.contributors === 1 ? 'contributor' : 'contributors'}
							</Text>
							{pool._count.ideas > 0 && (
								<>
									<span className="text-muted-foreground">·</span>
									<Text size="xs" className="text-muted-foreground">
										{pool._count.ideas}{' '}
										{pool._count.ideas === 1 ? 'idea' : 'ideas'}
									</Text>
								</>
							)}
							{pool.giftGroup && (
								<>
									<span className="text-muted-foreground">·</span>
									<Text size="xs" className="text-muted-foreground">
										{pool.giftGroup.name}
									</Text>
								</>
							)}
						</Flex>
					</Stack>
					<span
						className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}
					>
						{POOL_STATUS_LABELS[status]}
					</span>
				</Flex>
			</Card>
		</Link>
	)
}

function TabBadge({ count, isSelected }: { count: number; isSelected: boolean }) {
	if (count === 0) return null
	return (
		<span className={cn(
			'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
			isSelected ? 'bg-primary/10 text-primary' : 'bg-muted-foreground/20 text-muted-foreground',
		)}>
			{count}
		</span>
	)
}

function TabButton({
	id,
	isSelected,
	onClick,
	children,
}: {
	id: string
	isSelected: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={isSelected}
			aria-controls="pools-tabpanel"
			id={id}
			onClick={onClick}
			className={cn(
				'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
				isSelected
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground',
			)}
		>
			{children}
		</button>
	)
}

function PoolList({ pools, emptyMessage }: { pools: Pool[]; emptyMessage: string }) {
	if (pools.length === 0) {
		return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
	}
	return (
		<Stack gap={3}>
			{pools.map(p => (
				<PoolCard key={p.id} pool={p} />
			))}
		</Stack>
	)
}

const PoolsIndex = () => {
	const { active, completed } = useLoaderData<typeof loader>()
	const [tab, setTab] = useState<'active' | 'past'>('active')
	const hasAny = active.length > 0 || completed.length > 0
	const panelLabelId = tab === 'active' ? 'tab-active' : 'tab-past'

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader
				variant="section"
				icon={<LuGift className="text-primary" size={22} />}
				title="Pools"
			>
				<Button asChild>
					<Link to="/pools/new">
						<Flex gap={1}>
							<LuPlus />
							<Text>Start a Pool</Text>
						</Flex>
					</Link>
				</Button>
			</PageHeader>

			{/* Content */}
			<div className="mx-auto w-full max-w-6xl min-h-0 flex-1 px-4 py-8 sm:px-6">
				{!hasAny ? (
					<div className="mx-auto max-w-lg">
						<Card padding="lg" className="rounded-2xl text-center">
							<LuGift className="mx-auto mb-3 text-muted-foreground" size={32} />
							<div className="text-lg font-semibold">No pools yet.</div>
							<div className="mt-2 text-sm text-muted-foreground">
								Start a pool to organize a group gift for someone special.
							</div>
							<div className="mt-4">
								<Button asChild>
									<Link to="/pools/new">
										<Flex gap={1}>
											<LuPlus />
											<Text>Start your first pool</Text>
										</Flex>
									</Link>
								</Button>
							</div>
						</Card>
					</div>
				) : (
					<Stack gap={5}>
						{/* Tab bar */}
						<div role="tablist" aria-label="Pool filter" className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
							<TabButton id="tab-active" isSelected={tab === 'active'} onClick={() => setTab('active')}>
								Active
								<TabBadge count={active.length} isSelected={tab === 'active'} />
							</TabButton>
							<TabButton id="tab-past" isSelected={tab === 'past'} onClick={() => setTab('past')}>
								Past
								<TabBadge count={completed.length} isSelected={tab === 'past'} />
							</TabButton>
						</div>

						{/* Tab content */}
						<div
							id="pools-tabpanel"
							role="tabpanel"
							aria-labelledby={panelLabelId}
						>
							{tab === 'active' ? (
								<PoolList pools={active} emptyMessage="No active pools." />
							) : (
								<PoolList pools={completed} emptyMessage="No past pools." />
							)}
						</div>
					</Stack>
				)}
			</div>

		</div>
	)
}

export default PoolsIndex
