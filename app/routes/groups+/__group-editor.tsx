import { useForm, conform } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import { type GiftGroup } from '@prisma/client'
import { type SerializeFrom, type ActionFunctionArgs } from '@remix-run/node'
import { Form, json, redirect, useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { Field, TextareaField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Heading } from '#app/components/ui/heading'
import { SectionTitle } from '#app/components/ui/sectionTitle'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'

const nameMinLength = 1
const nameMaxLength = 100
const descriptionMinLength = 1
const descriptionMaxLength = 1000

const GroupEditorSchema = z.object({
	id: z.string().optional(),
	name: z.string().min(nameMinLength).max(nameMaxLength),
	description: z.string().min(descriptionMinLength).max(descriptionMaxLength),
})

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const submission = await parse(formData, {
		schema: GroupEditorSchema.superRefine(async (data, ctx) => {
			if (!data.id) return

			const giftGroup = await prisma.giftGroup.findUnique({
				select: {
					id: true,
					groupMembers: { select: { userId: true, role: true } },
				},
				where: {
					id: data.id,
					groupMembers: {
						some: { userId, OR: [{ role: 'owner' }, { role: 'admin' }] },
					},
				},
			})

			if (!giftGroup) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Gift Group not found',
				})
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

	const { id: giftGroupId, name, description } = submission.value

	const updatedGiftGroup = await prisma.giftGroup.upsert({
		select: {
			id: true,
			groupMembers: {
				select: {
					userId: true,
					role: true,
				},
			},
		},
		where: { id: giftGroupId ?? '__new_gift_group__' },
		create: {
			name,
			description,
			groupMembers: {
				create: {
					userId,
					role: 'owner',
				},
			},
		},
		update: {
			name,
			description,
		},
	})

	return redirect(`/groups/${updatedGiftGroup.id}`)
}

export function GroupEditor({
	group,
}: {
	group?: SerializeFrom<Pick<GiftGroup, 'name' | 'id'>>
}) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'group-editor',
		constraint: getFieldsetConstraint(GroupEditorSchema),
		lastSubmission: actionData?.submission,
		onValidate({ formData }) {
			return parse(formData, { schema: GroupEditorSchema })
		},
		defaultValue: {
			name: group?.name ?? '',
		},
	})

	return (
		<div>
			<SectionTitle>
				<Heading>New Group</Heading>
			</SectionTitle>
			<Form
				method="POST"
				className="flex flex-col gap-y-4 overflow-y-auto overflow-x-hidden px-10 pb-28 pt-12"
				{...form.props}
				encType="multipart/form-data"
			>
				<AuthenticityTokenInput />
				<button type="submit" className="hidden" />
				{group ? <input type="hidden" name="id" value={group.id} /> : null}
				<Field
					labelProps={{ children: 'Name' }}
					inputProps={{
						autoFocus: true,
						...conform.input(fields.name, { ariaAttributes: true }),
					}}
					errors={fields.name.errors}
				/>
				<TextareaField
					labelProps={{ children: 'Description' }}
					textareaProps={{
						...conform.input(fields.description, { ariaAttributes: true }),
					}}
					errors={fields.description.errors}
				/>
			</Form>
			<div className="flex justify-end gap-2 md:gap-4">
				<Button form={form.id} variant="destructive" type="reset">
					Reset
				</Button>
				<StatusButton
					form={form.id}
					type="submit"
					disabled={isPending}
					status={isPending ? 'pending' : 'idle'}
				>
					Submit
				</StatusButton>
			</div>
		</div>
	)
}
