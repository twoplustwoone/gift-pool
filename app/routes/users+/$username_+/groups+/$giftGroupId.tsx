import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { Heading } from '#app/components/ui/heading.tsx'
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'

export async function loader({ params }: LoaderFunctionArgs) {
	const giftGroup = await prisma.giftGroup.findUnique({
		where: { id: params.giftGroupId },
		select: {
			name: true,
			description: true,
			groupMembers: {
				select: {
					user: {
						select: {
							id: true,
							username: true,
							name: true,
							image: {
								select: {
									id: true,
									altText: true,
								},
							},
						},
					},
				},
			},
		},
	})

	invariantResponse(giftGroup, 'Not found', { status: 404 })

	return json({ giftGroup })
}

export function SectionSubtitle({ children }: { children?: React.ReactNode }) {
	if (!children) {
		return null
	}
	return <div className="mb-5">{children}</div>
}

function Subheading({ children }: { children: React.ReactNode }) {
	return <div className="text-lg text-slate-500">{children}</div>
}

export default function GiftGroup() {
	const data = useLoaderData<typeof loader>()
	const { giftGroup } = data
	return (
		<div>
			<SectionTitle>
				<Heading>{giftGroup.name}</Heading>
				<SectionSubtitle>
					<Subheading>{giftGroup.description}</Subheading>
				</SectionSubtitle>
			</SectionTitle>
			<div className="text-body-sm"></div>
			<div>
				<div className="text-xl font-bold">Members</div>
				{giftGroup.groupMembers.map(groupMember => (
					<div key={groupMember.user.id} className="flex items-center gap-2">
						<img
							src={getUserImgSrc(groupMember.user.image?.id)}
							alt={groupMember.user.name ?? groupMember.user.username}
							className="h-8 w-8 rounded-full object-cover"
						/>
						<div className="text-body-md">{groupMember.user.username}</div>
					</div>
				))}
			</div>
		</div>
	)
}
