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
  /** optional: force initial mode; otherwise auto: create if no id, edit if id */
  initialMode?: 'auto' | 'view' | 'edit' | 'create';
  /** if the viewer can edit; controls showing the "Edit" button in view mode */
  canEdit?: boolean;
};

export type WishlistItemEditorHandle = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  openView: () => void;
  openEdit: () => void;
  openCreate: () => void;
};

export const WishlistItemEditor = React.forwardRef<
  WishlistItemEditorHandle,
  EditorProps
>(({ wishlistItem, trigger, initialMode = 'auto', canEdit = false }, ref) => {
  const hasId = Boolean(wishlistItem?.id);
  const computedInitial: 'view' | 'edit' | 'create' =
    initialMode === 'auto'
      ? hasId
        ? 'edit'
        : 'create'
      : initialMode === 'view'
        ? 'view'
        : initialMode === 'edit'
          ? 'edit'
          : 'create';

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'view' | 'edit' | 'create'>(
    computedInitial,
  );

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
      openView: () => {
        setMode('view');
        setOpen(true);
      },
      openEdit: () => {
        setMode(hasId ? 'edit' : 'create');
        setOpen(true);
      },
      openCreate: () => {
        setMode('create');
        setOpen(true);
      },
    }),
    [hasId],
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

  const titleText =
    mode === 'view'
      ? 'Wishlist Item'
      : hasId
        ? 'Edit Wishlist Item'
        : 'Add Wishlist Item';

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
              onClick={() => {
                setMode('create');
                setOpen(true);
              }}
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
                onClick={() => {
                  setMode('create');
                  setOpen(true);
                }}
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
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        {/* === VIEW MODE (read-only) === */}
        {mode === 'view' ? (
          <div className="flex w-80 flex-col gap-4">
            <div>
              <Text size="xs" className="text-muted-foreground">
                Title
              </Text>
              <Text size="base" weight="medium" className="break-words">
                {wishlistItem?.title ?? '—'}
              </Text>
            </div>

            <div>
              <Text size="xs" className="text-muted-foreground">
                Link
              </Text>
              {wishlistItem?.url ? (
                <a
                  href={wishlistItem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary underline decoration-primary/40 underline-offset-4"
                >
                  {new URL(wishlistItem.url).hostname}
                  <Icon name="external-link" className="h-3 w-3" />
                </a>
              ) : (
                <Text size="base">—</Text>
              )}
            </div>

            <div>
              <Text size="xs" className="text-muted-foreground">
                Description
              </Text>
              <Text
                as="p"
                size="sm"
                className="whitespace-pre-wrap break-words text-foreground/90"
              >
                {wishlistItem?.note || '—'}
              </Text>
            </div>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Close
                </Button>
              </DialogClose>
              {canEdit && hasId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setMode('edit')}
                >
                  Edit
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : (
          /* === EDIT / CREATE FORM === */
          <Form
            method="POST"
            {...getFormProps(form)}
            className="flex flex-col gap-4"
            encType="multipart/form-data"
            ref={formRef}
          >
            {mode === 'create' ? (
              <button
                type="submit"
                name="intent"
                value="save-add-another"
                className="hidden"
              />
            ) : null}

            {hasId ? (
              <>
                <input type="hidden" name="id" value={wishlistItem!.id} />
                {wishlistItem?.type ? (
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
              {mode === 'create' ? (
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
        )}
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
