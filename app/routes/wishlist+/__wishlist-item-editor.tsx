import { getFormProps, getInputProps, useForm } from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type WishlistItem } from '@prisma/client';
import { type SerializeFrom } from '@remix-run/node';
import { Form, useActionData } from '@remix-run/react';
import React, { useRef } from 'react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx';
import { Button } from '#app/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '#app/components/ui/dialog';
import { Icon } from '#app/components/ui/icon';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Text } from '#app/components/ui-kit';
import { useIsPending } from '#app/utils/misc.tsx';
import { type action } from './__wishlist-item-editor.server';

const valueMinLength = 1;
const valueMaxLength = 255;

export const WishlistItemSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  title: z.string().min(valueMinLength).max(valueMaxLength),
  note: z.string().optional(),
  url: z.string().url().optional(),
  type: z.enum(['text', 'link', 'wishlist']),
});

export function WishlistItemEditor({
  wishlistItem,
}: {
  wishlistItem?: SerializeFrom<Pick<WishlistItem, 'id' | 'title'>>;
}) {
  const [open, setOpen] = React.useState(false);
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const formRef = useRef<HTMLFormElement>(null);

  // TODO: Add logic to close/reset dialog based on actionData
  React.useEffect(() => {
    // If the actionData exists and the submission was successful, reset the form
    if (actionData?.status === 'success') {
      formRef.current?.reset(); // Reset
    }
  }, [actionData]);

  const [form, fields] = useForm({
    id: 'wishlist-item-editor',
    constraint: getZodConstraint(WishlistItemSchema),
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: WishlistItemSchema });
    },
    defaultValue: {
      title: wishlistItem?.title ?? '',
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" onClick={() => setOpen(true)}>
          <Icon name="plus" />
          <Text size="sm">Add Wishlist Item</Text>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Wishlist Item</DialogTitle>
        </DialogHeader>
        <Form
          method="POST"
          {...getFormProps(form)}
          className="flex flex-col gap-4"
          encType="multipart/form-data"
          ref={formRef}
        >
          {/* Hidden submit for Enter key */}
          <button type="submit" className="hidden" />
          {wishlistItem ? (
            <input type="hidden" name="id" value={wishlistItem.id} />
          ) : null}
          <Field
            className="w-80"
            labelProps={{ children: 'Title' }}
            inputProps={{
              placeholder: 'Title for your item',
              autoFocus: true,
              ...getInputProps(fields.title, {
                type: 'text',
                ariaAttributes: true,
              }),
            }}
            errors={fields.title.errors}
          />
          <Field
            className="w-80"
            labelProps={{ children: 'Link' }}
            inputProps={{
              placeholder: 'https://amazon.com/',
              ...getInputProps(fields.url, {
                type: 'url',
                ariaAttributes: true,
              }),
            }}
            errors={[]}
          />
          <TextareaField
            className="w-80"
            labelProps={{ children: 'Description' }}
            textareaProps={{
              placeholder: 'Describe the item...',
              rows: 3,
              ...getInputProps(fields.note, {
                type: 'text',
                ariaAttributes: true,
              }),
            }}
            errors={[]}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <StatusButton
              form={form.id}
              type="submit"
              disabled={isPending}
              status={isPending ? 'pending' : 'idle'}
              variant="secondary"
              name="intent"
              value="save-add-another"
            >
              Save & Add Another
            </StatusButton>
            <StatusButton
              form={form.id}
              type="submit"
              disabled={isPending}
              status={isPending ? 'pending' : 'idle'}
              variant="default"
              name="intent"
              value="save"
            >
              Save
            </StatusButton>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
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
  );
}
