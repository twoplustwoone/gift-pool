import { conform, useForm } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import { type WishlistItem } from '@prisma/client'
import {
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	json,
	unstable_parseMultipartFormData as parseMultipartFormData,
	type ActionFunctionArgs,
	type SerializeFrom,
} from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import React, { useRef } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'

const valueMinLength = 1
const valueMaxLength = 255

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3 // 3MB

const WishlistItemSchema = z.object({
	id: z.string().optional(),
	value: z.string().min(valueMinLength).max(valueMaxLength),
})

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)

	const formData = await parseMultipartFormData(
		request,
		createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD_SIZE }),
	)
	await validateCSRF(formData, request.headers)

	const submission = await parse(formData, {
		schema: WishlistItemSchema.superRefine(async (data, ctx) => {
			if (!data.id) return

			const wishlistItem = await prisma.wishlistItem.findUnique({
				select: { id: true },
				where: { id: data.id, ownerId: userId },
			})
			if (!wishlistItem) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Wishlist item not found',
				})
			}
		}).transform(async ({ ...data }) => {
			return {
				...data,
			}
		}),
		async: true,
	})

	if (submission.intent !== 'submit') {
		return json({ submission } as const)
	}

	if (!submission.value) {
		return json({ submission } as const, { status: 400 })
	}

	const { id: wishlistItemId, value } = submission.value

	await prisma.wishlistItem.upsert({
		select: { id: true, owner: { select: { username: true } } },
		where: { id: wishlistItemId ?? '__new_wishlist_item__' },
		create: {
			ownerId: userId,
			value,
		},
		update: {
			value,
		},
	})

	return json({
		submission,
	})
}

export function WishlistItemEditor({
	wishlistItem,
}: {
	wishlistItem?: SerializeFrom<Pick<WishlistItem, 'id' | 'value'>>
}) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const formRef = useRef<HTMLFormElement>(null)

	React.useEffect(() => {
		// If the actionData exists and the submission was successful, reset the form
		if (actionData && !Object.keys(actionData.submission?.error).length) {
			formRef.current?.reset() // Reset
		}
	}, [actionData])

	const [form, fields] = useForm({
		id: 'wishlist-item-editor',
		constraint: getFieldsetConstraint(WishlistItemSchema),
		lastSubmission: actionData?.submission,
		onValidate({ formData }) {
			return parse(formData, { schema: WishlistItemSchema })
		},
		defaultValue: {
			value: wishlistItem?.value ?? '',
		},
	})

	return (
		<div className="flex gap-4">
			{/* <div className="absolute inset-0"> */}
			<Form
				method="POST"
				{...form.props}
				encType="multipart/form-data"
				ref={formRef}
			>
				<AuthenticityTokenInput />
				{/*
					This hidden submit button is here to ensure that when the user hits
					"enter" on an input field, the primary form function is submitted
					rather than the first button in the form (which is delete/add image).
				*/}
				<button type="submit" className="hidden" />
				{wishlistItem ? (
					<input type="hidden" name="id" value={wishlistItem.id} />
				) : null}
				<div className="flex flex-col gap-1">
					<Field
						className="w-80"
						labelProps={{}}
						inputProps={{
							autoFocus: true,
							placeholder: 'Add item to your wishlist',
							...conform.input(fields.value, { ariaAttributes: true }),
						}}
						errors={fields.value.errors}
					/>
				</div>
				<ErrorList id={form.errorId} errors={form.errors} />
			</Form>
			<StatusButton
				form={form.id}
				type="submit"
				disabled={isPending}
				status={isPending ? 'pending' : 'idle'}
			>
				Add Item
			</StatusButton>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<p>No wishlist item with the id "{params.wishlistId}" exists</p>
				),
			}}
		/>
	)
}
