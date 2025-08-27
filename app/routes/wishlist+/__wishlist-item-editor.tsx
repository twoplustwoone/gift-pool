// __wishlist-item-editor.tsx
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
import { Flex, Text } from '#app/components/ui-kit';
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

type EditorProps = {
  wishlistItem?: SerializeFrom<
    Pick<WishlistItem, 'id' | 'title' | 'url' | 'note' | 'type'>
  >;
  trigger?: React.ReactNode;
};

export type WishlistItemEditorHandle = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export const WishlistItemEditor = React.forwardRef<
  WishlistItemEditorHandle,
  EditorProps
>(({ wishlistItem, trigger }, ref) => {
  const isEditing = Boolean(wishlistItem?.id);
  const [open, setOpen] = React.useState(false);

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
    }),
    [],
  );

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
      if (actionData.intent === 'save') setOpen(false);
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
          <>
            {/* Desktop add button */}
            <Button
              className="hidden sm:inline-flex"
              variant="default"
              onClick={() => setOpen(true)}
            >
              <Flex gap={1}>
                <Icon name="plus" />
                <Text size="sm">Add Wishlist Item</Text>
              </Flex>
            </Button>
            {/* Mobile FAB add button */}
            {!open && (
              <Button
                type="button"
                size="icon"
                onClick={() => setOpen(true)}
                aria-label="Add Wishlist Item"
                title="Add Wishlist Item"
                className="fixed bottom-[calc(theme(spacing.4)+env(safe-area-inset-bottom)+4rem)] right-4 z-40 h-14 w-14 rounded-full border bg-primary text-primary-foreground shadow-lg sm:hidden"
              >
                <Icon name="plus" />
              </Button>
            )}
          </>
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
});

WishlistItemEditor.displayName = 'WishlistItemEditor';

export const ErrorBoundary = () => (
  <GeneralErrorBoundary
    statusHandlers={{
      404: ({ params }) => (
        <p>No wishlist item with the id "{params.wishlistId}" exists</p>
      ),
    }}
  />
);
