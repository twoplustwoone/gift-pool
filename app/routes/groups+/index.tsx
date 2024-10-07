import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import { Heading } from '#app/components/ui/heading.tsx'
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: {
			id: true,
			giftGroups: { select: { giftGroup: true } },
		},
		where: { id: userId },
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return json({ user })
}

export default function GroupsIndex() {
	const data = useLoaderData<typeof loader>()

	const { user } = data
	return (
		<div>
			<SectionTitle>
				<Heading>My Groups</Heading>
				<Button asChild>
					<Link to={`/groups/new`}>Create Group</Link>
				</Button>
			</SectionTitle>
			<div className="mt-4 space-y-4">
				{user.giftGroups.map(group => (
					<div key={group.giftGroup.id}>
						<Link to={`/groups/${group.giftGroup.id}`}>
							{group.giftGroup.name}
						</Link>
					</div>
				))}
			</div>
		</div>
	)
}
