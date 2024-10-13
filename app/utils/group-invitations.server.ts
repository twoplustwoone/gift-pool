export const getInviteLink = (code: string) => {
	return `${process.env.REMIX_APP_URL}/groups/join/${code}`
}

export const createInviteLink = async (_request: Request) => {
	// TODO: Implement this function
}
