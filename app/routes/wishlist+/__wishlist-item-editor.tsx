import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type WishlistItem } from '@prisma/client'
import { type SerializeFrom } from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import React, { useRef } from 'react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { useIsPending } from '#app/utils/misc.tsx'
import { type action } from './__wishlist-item-editor.server'

const valueMinLength = 1
const valueMaxLength = 255

export const WishlistItemSchema = z.object({
	id: z.string().optional(),
	value: z.string().min(valueMinLength).max(valueMaxLength),
})

export function WishlistItemEditor({
	wishlistItem,
}: {
	wishlistItem?: SerializeFrom<Pick<WishlistItem, 'id' | 'title'>>
}) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const formRef = useRef<HTMLFormElement>(null)

	React.useEffect(() => {
		// If the actionData exists and the submission was successful, reset the form
		if (actionData?.status === 'success') {
			formRef.current?.reset() // Reset
		}
	}, [actionData])

	const [form, fields] = useForm({
		id: 'wishlist-item-editor',
		constraint: getZodConstraint(WishlistItemSchema),
		lastResult: actionData,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: WishlistItemSchema })
		},
		defaultValue: {
			value: wishlistItem?.title ?? '',
		},
	})

	return (
		<div className="flex gap-4">
			{/* <div className="absolute inset-0"> */}
			<Form
				method="POST"
				{...getFormProps(form)}
				encType="multipart/form-data"
				ref={formRef}
			>
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
							...getInputProps(fields.value, {
								type: 'text',
								ariaAttributes: true,
							}),
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
