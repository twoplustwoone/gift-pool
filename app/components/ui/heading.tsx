export function Heading({ children }: { children: React.ReactNode }) {
	return (
		<h1 className="text-center text-base font-bold md:text-lg lg:text-left lg:text-2xl">
			{children}
		</h1>
	)
}
