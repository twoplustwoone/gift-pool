export function SectionSubtitle({ children }: { children?: React.ReactNode }) {
	if (!children) {
		return null
	}
	return <div className="mb-5">{children}</div>
}
