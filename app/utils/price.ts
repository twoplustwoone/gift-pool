export function dollarsToCents(value: number): number {
	return Math.round((value + Number.EPSILON) * 100)
}

export function dollarsStringToCents(value: string): number {
	return dollarsToCents(Number(value))
}
