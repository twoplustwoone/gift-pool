import { LuGift, LuPlus } from 'react-icons/lu'
import { Link, type LoaderFunctionArgs, useLoaderData } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Flex, Stack, Text } from '#app/components/ui-kit'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
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
	const completedStatuses: PoolStatus[] = [
		POOL_STATUS.DELIVERED,
		POOL_STATUS.CANCELLED,
	]
	const active = pools.filter(
		p => !completedStatuses.includes(p.status as PoolStatus),
	)
	const completed = pools.filter(p =>
		completedStatuses.includes(p.status as PoolStatus),
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
								{new Date(pool.eventDate).toLocaleDateString('en-US', {
									month: 'long',
									day: 'numeric',
									year: 'numeric',
								})}
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

const PoolsIndex = () => {
	const { active, completed } = useLoaderData<typeof loader>()

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/* Header */}
			<div className="border-b bg-surface px-4 py-4 shadow">
				<div className="container flex items-center justify-between gap-2">
					<Flex gap={2} align="center">
						<LuGift className="text-primary" size={22} />
						<Text size="xl" weight="bold">
							Pools
						</Text>
					</Flex>
					<Button asChild>
						<Link to="/pools/new">
							<Flex gap={1}>
								<LuPlus />
								<Text>Start a Pool</Text>
							</Flex>
						</Link>
					</Button>
				</div>
			</div>

			{/* Content */}
			<div className="container min-h-0 flex-1 py-8">
				{active.length === 0 && completed.length === 0 ? (
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
					<Stack gap={8}>
						{active.length > 0 && (
							<Stack gap={3}>
								<Text weight="semibold" className="text-muted-foreground uppercase tracking-wide text-xs">
									Active
								</Text>
								<Stack gap={3}>
									{active.map(p => (
										<PoolCard key={p.id} pool={p} />
									))}
								</Stack>
							</Stack>
						)}
						{completed.length > 0 && (
							<Stack gap={3}>
								<Text weight="semibold" className="text-muted-foreground uppercase tracking-wide text-xs">
									Completed
								</Text>
								<Stack gap={3}>
									{completed.map(p => (
										<PoolCard key={p.id} pool={p} />
									))}
								</Stack>
							</Stack>
						)}
					</Stack>
				)}
			</div>

			{/* Floating create button for mobile */}
			<div className="fixed bottom-[calc(theme(spacing.4)+theme(spacing.bottom-nav))] right-4 z-40 sm:hidden">
				<Button
					asChild
					size="icon"
					aria-label="Start a Pool"
					className="h-14 w-14 rounded-full border bg-primary text-primary-foreground shadow-lg"
				>
					<Link to="/pools/new">
						<Icon name="plus" />
					</Link>
				</Button>
			</div>
		</div>
	)
}

export default PoolsIndex
