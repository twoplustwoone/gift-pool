import { cn } from '#app/utils/misc'

export type BoxProps = {
	children: React.ReactNode
	className?: string | undefined
	paddingInline?: number
	paddingInlineStart?: number
	paddingInlineEnd?: number
	paddingBlock?: number
	paddingBlockStart?: number
	paddingBlockEnd?: number
}

export const Box = ({
	children,
	className,
	paddingInline,
	paddingInlineStart,
	paddingInlineEnd,
	paddingBlock,
	paddingBlockStart,
	paddingBlockEnd,
}: BoxProps) => {
	const paddingClasses = []

	// Handle paddingInline (applies to both start and end)
	if (paddingInline !== undefined) {
		paddingClasses.push(`px-${paddingInline}`)
	}

	// Handle paddingInlineStart (overrides paddingInline for start)
	if (paddingInlineStart !== undefined) {
		paddingClasses.push(`ps-${paddingInlineStart}`)
	}

	// Handle paddingInlineEnd (overrides paddingInline for end)
	if (paddingInlineEnd !== undefined) {
		paddingClasses.push(`pe-${paddingInlineEnd}`)
	}

	// Handle paddingBlock (applies to both start and end)
	if (paddingBlock !== undefined) {
		paddingClasses.push(`py-${paddingBlock}`)
	}

	// Handle paddingBlockStart (overrides paddingBlock for start)
	if (paddingBlockStart !== undefined) {
		paddingClasses.push(`pt-${paddingBlockStart}`)
	}

	// Handle paddingBlockEnd (overrides paddingBlock for end)
	if (paddingBlockEnd !== undefined) {
		paddingClasses.push(`pb-${paddingBlockEnd}`)
	}

	return <div className={cn(paddingClasses, className)}>{children}</div>
}
