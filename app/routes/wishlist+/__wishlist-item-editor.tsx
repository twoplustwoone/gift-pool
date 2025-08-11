import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type WishlistItem } from '@prisma/client';
import { type SerializeFrom } from '@remix-run/node';
import { Form, useActionData } from '@remix-run/react';
import React, { useRef } from 'react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Field, TextareaField } from '#app/components/forms.tsx';
import { useToast } from '#app/components/toaster.tsx';
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
import { type Toast } from '#app/utils/toast.server.ts';
import { type action } from './__wishlist-item-editor.server';

const valueMinLength = 1;
const valueMaxLength = 255;

export const WishlistItemSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  title: z.string().min(valueMinLength).max(valueMaxLength),
  note: z.string().optional(),
  url: z.string().url().optional(),
  type: z.enum(['text', 'link', 'wishlist']).default('text'),
});

export function WishlistItemEditor({
  wishlistItem,
  trigger,
}: {
  wishlistItem?: SerializeFrom<
    Pick<WishlistItem, 'id' | 'title' | 'url' | 'note' | 'type'>
  >;
  trigger?: React.ReactNode;
}) {
  const isEditing = Boolean(wishlistItem?.id);
  const [open, setOpen] = React.useState(false);
  const actionData = useActionData<typeof action>() as
    | {
        result: SubmissionResult<z.infer<typeof WishlistItemSchema>>;
        intent: 'save' | 'save-add-another';
        toast: Toast | null;
      }
    | undefined;
  const isPending = useIsPending();
  const formRef = useRef<HTMLFormElement>(null);

  useToast(actionData?.toast);

  React.useEffect(() => {
    if (actionData?.result?.status === 'success') {
      formRef.current?.reset();
      if (actionData.intent === 'save') {
        setOpen(false);
      }
    }
  }, [actionData]);

  const [form, fields] = useForm<z.infer<typeof WishlistItemSchema>>({
    id: 'wishlist-item-editor',
    constraint: getZodConstraint(WishlistItemSchema),
    lastResult: actionData?.result as any,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: WishlistItemSchema });
    },
    defaultValue: {
      title: wishlistItem?.title ?? '',
      url: wishlistItem?.url ?? '',
      note: wishlistItem?.note ?? '',
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button variant="default" onClick={() => setOpen(true)}>
            <Icon name="plus" />
            <Text size="sm">Add Wishlist Item</Text>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {wishlistItem ? 'Edit Wishlist Item' : 'Add Wishlist Item'}
          </DialogTitle>
        </DialogHeader>
        <Form
          method="POST"
          {...getFormProps(form)}
          className="flex flex-col gap-4"
          encType="multipart/form-data"
          ref={formRef}
        >
          {/* Hidden submit for Enter key (creation only) */}
          {!isEditing ? (
            <button
              type="submit"
              name="intent"
              value="save-add-another"
              className="hidden"
            />
          ) : null}
          {wishlistItem ? (
            <>
              <input type="hidden" name="id" value={wishlistItem.id} />
              {wishlistItem.type ? (
                <input type="hidden" name="type" value={wishlistItem.type} />
              ) : null}
            </>
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
            errors={fields.url.errors}
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
              value="save"
            >
              Save
            </StatusButton>
            {!isEditing ? (
              <StatusButton
                form={form.id}
                type="submit"
                disabled={isPending}
                status={isPending ? 'pending' : 'idle'}
                variant="default"
                name="intent"
                value="save-add-another"
              >
                Save & Add Another
              </StatusButton>
            ) : null}
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
