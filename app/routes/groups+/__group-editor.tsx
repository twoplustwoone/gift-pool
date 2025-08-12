import { getFormProps, getInputProps, useForm } from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type GiftGroup } from '@prisma/client';
import { type SerializeFrom } from '@remix-run/node';
import { Form, useActionData } from '@remix-run/react';
import { z } from 'zod';
import { Field, TextareaField } from '#app/components/forms.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Heading } from '#app/components/ui/heading';
import { SectionTitle } from '#app/components/ui/sectionTitle';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { useIsPending } from '#app/utils/misc.tsx';
import { type action } from './__group-editor.server';

const nameMinLength = 1;
const nameMaxLength = 100;
const descriptionMinLength = 1;
const descriptionMaxLength = 1000;

export const GroupEditorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(nameMinLength).max(nameMaxLength),
  description: z.string().min(descriptionMinLength).max(descriptionMaxLength),
});

export const GroupEditor = ({
  group,
}: {
  group?: SerializeFrom<Pick<GiftGroup, 'name' | 'id'>>;
}) => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();

  const [form, fields] = useForm({
    id: 'group-editor',
    constraint: getZodConstraint(GroupEditorSchema),
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: GroupEditorSchema });
    },
    defaultValue: {
      name: group?.name ?? '',
    },
  });

  return (
    <div>
      <SectionTitle>
        <Heading>New Group</Heading>
      </SectionTitle>
      <Form
        method="POST"
        className="flex flex-col gap-y-4 overflow-y-auto overflow-x-hidden px-10 pb-28 pt-12"
        {...getFormProps(form)}
        encType="multipart/form-data"
      >
        <button type="submit" className="hidden" />
        {group ? <input type="hidden" name="id" value={group.id} /> : null}
        <Field
          labelProps={{ children: 'Name' }}
          inputProps={{
            autoFocus: true,
            ...getInputProps(fields.name, {
              type: 'text',
              ariaAttributes: true,
            }),
          }}
          errors={fields.name.errors}
        />
        <TextareaField
          labelProps={{ children: 'Description' }}
          textareaProps={{
            ...getInputProps(fields.description, {
              type: 'text',
              ariaAttributes: true,
            }),
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
  );
}
