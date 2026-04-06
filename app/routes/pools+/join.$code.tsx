import {
	data,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	Form,
	useLoaderData,
	useNavigate,
} from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '#app/components/ui/dialog.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { POOL_STATUS, OCCASION_TYPE_LABELS, type OccasionType } from '#app/utils/pool-constants.ts'
import { isUserInPool } from '#app/utils/pool.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

async function requireValidInvite(code: string) {
	const pool = await prisma.pool.findUnique({
		where: { inviteCode: code },
		select: {
			id: true,
			title: true,
			occasionType: true,
			status: true,
			recipientUserId: true,
			recipientName: true,
			recipientUser: { select: { name: true, username: true } },
			_count: { select: { contributors: true } },
		},
	})

	if (!pool) {
		throw data({ error: 'Invite link not found.' }, { status: 404 })
	}

	if (
		pool.status === POOL_STATUS.CANCELLED ||
		pool.status === POOL_STATUS.DELIVERED
	) {
		throw data({ error: 'This pool is no longer active.' }, { status: 410 })
	}

	return pool
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	const { code } = params
	if (!code) return redirect('/pools')

	const userId = await requireUserId(request)
	const pool = await requireValidInvite(code)

	// If they're the recipient, quietly redirect — they shouldn't know this exists
	if (pool.recipientUserId === userId) {
		return redirect('/pools')
	}

	// Already a contributor — just send them to the pool
	if (await isUserInPool(userId, pool.id)) {
		return redirect(`/pools/${pool.id}`)
	}

	const recipientLabel =
		pool.recipientName ??
		pool.recipientUser?.name ??
		pool.recipientUser?.username ??
		'someone special'

	return {
		poolId: pool.id,
		poolTitle: pool.title,
		occasionType: pool.occasionType as OccasionType,
		recipientLabel,
		contributorCount: pool._count.contributors,
	}
}

export async function action({ params, request }: ActionFunctionArgs) {
	const { code } = params
	if (!code) return redirect('/pools')

	const userId = await requireUserId(request)
	const pool = await requireValidInvite(code)

	if (pool.recipientUserId === userId) return redirect('/pools')

	const alreadyIn = await isUserInPool(userId, pool.id)
	if (!alreadyIn) {
		await prisma.poolContributor.create({
			data: { poolId: pool.id, userId },
		})
	}

	return redirectWithToast(`/pools/${pool.id}`, {
		type: 'success',
		description: `You've joined the pool — welcome!`,
	})
}

const JoinPoolPage = () => {
	const { poolTitle, occasionType, recipientLabel, contributorCount } =
		useLoaderData<typeof loader>()
	const navigate = useNavigate()

	return (
		<div className="flex flex-col items-center justify-center">
			<Dialog open>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>You're invited to a pool 🎁</DialogTitle>
					</DialogHeader>
					<div className="space-y-2 text-sm text-muted-foreground">
						<p>
							<span className="font-semibold text-foreground">{poolTitle}</span>
						</p>
						<p>
							{OCCASION_TYPE_LABELS[occasionType]} for{' '}
							<span className="font-medium text-foreground">{recipientLabel}</span>
						</p>
						<p>
							{contributorCount}{' '}
							{contributorCount === 1 ? 'contributor' : 'contributors'} so far
						</p>
					</div>
					<DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
						<DialogClose asChild>
							<Button
								onClick={() => navigate('/pools')}
								variant="secondary"
								type="button"
								className="min-w-28"
							>
								Maybe later
							</Button>
						</DialogClose>
						<Form method="post" className="inline-block">
							<Button className="min-w-28">Join pool</Button>
						</Form>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default JoinPoolPage
