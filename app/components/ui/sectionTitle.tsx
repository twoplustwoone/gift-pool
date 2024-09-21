import React from 'react'
import { SectionSubtitle } from '#app/routes/users+/$username_+/groups+/$giftGroupId.tsx'

export function SectionTitle({ children }: { children?: React.ReactNode }) {
	const [subtitle, childrenWithoutSubtitle] = React.Children.toArray(
		children,
	).reduce<[React.ReactNode | null, React.ReactNode[]]>(
		([subtitle, others], child) => {
			if (React.isValidElement(child) && child.type === SectionSubtitle) {
				return [child, others]
			}
			return [subtitle, [...others, child]]
		},
		[null, []] as [React.ReactNode | null, React.ReactNode[]],
	)

	return (
		<div className="pb-4">
			<div className="flex flex-row items-center justify-start gap-4 bg-muted pr-4 pt-12">
				{childrenWithoutSubtitle}
			</div>
			{subtitle}
		</div>
	)
}
