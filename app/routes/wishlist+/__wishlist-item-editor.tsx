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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LuExternalLink, LuImage, LuLink2, LuPlus, LuUpload } from 'react-icons/lu';
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
import { Input } from '#app/components/ui/input';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Flex, Text } from '#app/components/ui-kit';
import { getWishlistItemImgSrc, useIsPending } from '#app/utils/misc.tsx';
import { type Toast } from '#app/utils/toast.server.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import { type action } from './__wishlist-item-editor.server';

const valueMinLength = 1;
const valueMaxLength = 255;

const ImageActionSchema = z
  .enum(['none', 'upload', 'url', 'auto-detect', 'remove'])
  .default('none');

export const WishlistItemSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  title: z.string().min(valueMinLength).max(valueMaxLength),
  note: z.string().optional(),
  url: z.string().url().optional(),
  type: z.enum(['text', 'link', 'wishlist']).default('text'),
  imageAction: ImageActionSchema,
  imageUrl: z.string().url().optional(),
  imageFile: z.instanceof(File).optional(),
});

type EditorProps = {
  wishlistItem?: SerializeFrom<
    Pick<WishlistItem, 'id' | 'title' | 'url' | 'note' | 'type' | 'categoryId'> &
      Partial<{ hasImage: boolean; imageSource: WishlistItemImageSource | null }>
  >;
  trigger?: React.ReactNode;
  initialMode?: 'auto' | 'view' | 'edit' | 'create';
  canEdit?: boolean;
  categories?: { id: string; name: string }[];
  defaultCategoryId?: string | null;
  viewExtras?: React.ReactNode;
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
>(
  (
    {
      wishlistItem,
      trigger,
      initialMode = 'auto',
      canEdit = false,
      categories = [],
      defaultCategoryId = null,
      viewExtras,
    },
    ref,
  ) => {
    const hasId = Boolean(wishlistItem?.id);
    const computedInitial: 'view' | 'edit' | 'create' =
      initialMode === 'auto'
        ? hasId
          ? canEdit
            ? 'edit'
            : 'view'
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
          if (!canEdit) {
            setMode('view');
            setOpen(true);
            return;
          }
          setMode(hasId ? 'edit' : 'create');
          setOpen(true);
        },
        openCreate: () => {
          setMode('create');
          setOpen(true);
        },
      }),
      [hasId, canEdit],
    );

    const actionData = useActionData<typeof action>() as
      | {
          result: SubmissionResult<z.infer<typeof WishlistItemSchema>>;
          intent: 'save' | 'save-add-another';
          toast: Toast | null;
          imageError?: string | null;
          imageAction?: z.infer<typeof ImageActionSchema>;
        }
      | undefined;

    const isPending = useIsPending();
    const formRef = useRef<HTMLFormElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentImageSrc = useMemo(
      () =>
        wishlistItem?.hasImage && wishlistItem?.id
          ? getWishlistItemImgSrc(wishlistItem.id)
          : null,
      [wishlistItem?.hasImage, wishlistItem?.id],
    );
    const [imageActionState, setImageActionState] = useState<
      z.infer<typeof ImageActionSchema>
    >('none');
    const [imagePreview, setImagePreview] = useState<string | null>(
      currentImageSrc,
    );
    const [previewVersion, setPreviewVersion] = useState(0);
    const [imageError, setImageError] = useState<string | null>(null);

    useToast(actionData?.toast);

    useEffect(() => {
      setImagePreview(currentImageSrc);
      setImageActionState('none');
    }, [currentImageSrc]);

    useEffect(() => {
      if (actionData?.imageError) {
        setImageError(actionData.imageError);
      } else {
        setImageError(null);
      }

      if (actionData?.result?.status === 'success') {
        formRef.current?.reset();
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        if (!actionData.imageError) {
          setImageActionState('none');
          setPreviewVersion((v) => v + 1);
        }
        if (actionData.intent === 'save') setOpen(false);
      }
    }, [actionData]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const [file] = Array.from(event.target.files ?? []);
      if (!file) {
        setImageActionState('none');
        setImagePreview(currentImageSrc);
        return;
      }
      setImageActionState('upload');
      setImagePreview(URL.createObjectURL(file));
      setImageError(null);
    };

    const handlePasteImage = (event: React.ClipboardEvent<HTMLDivElement>) => {
      const [file] = Array.from(event.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (!file) return;
      event.preventDefault();
      const transfer = new DataTransfer();
      transfer.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = transfer.files;
      }
      setImageActionState('upload');
      setImagePreview(URL.createObjectURL(file));
      setImageError(null);
    };

    const triggerImageRetry = () => setPreviewVersion((v) => v + 1);

    const formId = React.useId();

    const [form, fields] = useForm<z.input<typeof WishlistItemSchema>>({
      id: formId,
      constraint: getZodConstraint(WishlistItemSchema),
      lastResult: actionData?.result as any,
      onValidate({ formData }) {
        return parseWithZod(formData, { schema: WishlistItemSchema }) as any;
      },
      defaultValue: {
        title: wishlistItem?.title ?? '',
        url: wishlistItem?.url ?? '',
        note: wishlistItem?.note ?? '',
        categoryId: wishlistItem?.categoryId ?? defaultCategoryId ?? '',
        imageAction: 'none',
        imageUrl: '',
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
        {trigger ? (
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        ) : !wishlistItem ? (
          <>
            {/* Desktop add button */}
            <DialogTrigger asChild>
              <Button
                className="hidden sm:inline-flex"
                variant="outline"
                onClick={() => setMode('create')}
              >
                <Flex gap={1}>
                  <LuPlus />
                  <Text size="sm">Add Item</Text>
                </Flex>
              </Button>
            </DialogTrigger>
            {/* Mobile FAB add button */}
            {!open && (
              <DialogTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  onClick={() => setMode('create')}
                  aria-label="Add Item"
                  title="Add Item"
                  className="fixed bottom-[calc(theme(spacing.4)+theme(spacing.bottom-nav))] right-4 z-40 h-14 w-14 rounded-full border bg-primary text-primary-foreground shadow-lg sm:hidden"
                >
                  <Icon name="plus" />
                </Button>
              </DialogTrigger>
            )}
          </>
        ) : null}

        {/* Optional: ensure dialog can fit our inner width comfortably */}
        <DialogContent className="sm:max-w-[36rem]">
          <DialogHeader>
            <DialogTitle>{titleText}</DialogTitle>
          </DialogHeader>

          {/* Shared width container for BOTH modes */}
          <div className="mx-auto w-full sm:w-[28rem]">
            {mode === 'view' ? (
              <div className="flex flex-col gap-5">
                {wishlistItem?.hasImage ? (
                  <div className="overflow-hidden rounded-lg border bg-muted/40">
                    <img
                      src={`${getWishlistItemImgSrc(wishlistItem.id)}`}
                      alt={wishlistItem.title}
                      className="h-full w-full max-h-80 object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : null}
                <dl className="grid grid-cols-1 items-start gap-y-4 sm:grid-cols-[7.5rem,1fr] sm:gap-x-4 sm:gap-y-5">
                  {/* Title */}
                  <dt className="text-xs text-muted-foreground sm:text-sm">
                    Title
                  </dt>
                  <dd className="break-words text-base font-medium">
                    {wishlistItem?.title ?? '—'}
                  </dd>

                  {/* Link */}
                  <dt className="text-xs text-muted-foreground sm:text-sm">
                    Link
                  </dt>
                  <dd className="break-all text-base">
                    {wishlistItem?.url ? (
                      <a
                        href={wishlistItem.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-primary underline decoration-primary/40 underline-offset-4"
                      >
                        {/* show hostname as primary text; long paths still wrap because of break-all on dd */}
                        {new URL(wishlistItem.url).hostname}
                        <LuExternalLink className="h-3 w-3" />
                        {/* <Icon name="external-link" className="h-3 w-3" /> */}
                      </a>
                    ) : (
                      <span>—</span>
                    )}
                  </dd>

                  {/* Description */}
                  <dt className="text-xs text-muted-foreground sm:text-sm">
                    Description
                  </dt>
                  <dd className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                    {wishlistItem?.note || '—'}
                  </dd>
                </dl>

                {viewExtras ? <div className="rounded-lg bg-muted/50 p-4">{viewExtras}</div> : null}

                <DialogFooter className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      Close
                    </Button>
                  </DialogClose>

                  {canEdit && hasId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setMode('edit')}
                      className="w-full sm:w-auto"
                    >
                      Edit
                    </Button>
                  ) : null}
                </DialogFooter>
              </div>
            ) : (
              // === EDIT / CREATE FORM ===
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
                      <input
                        type="hidden"
                        name="type"
                        value={wishlistItem.type}
                      />
                    ) : null}
                  </>
                ) : null}

                <Field
                  className="w-full"
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
                  className="w-full"
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
                  className="w-full"
                  labelProps={{ children: 'Description' }}
                  textareaProps={{
                    placeholder: 'Describe the item...',
                    rows: 3,
                    ...getInputProps(fields.note, {
                      type: 'text',
                      ariaAttributes: true,
                    }),
                  }}
                  errors={fields.note.errors}
                />

                <div className="flex flex-col gap-2">
                  <label htmlFor={fields.categoryId.id}>Category</label>
                  <select
                    {...getInputProps(fields.categoryId, {
                      type: 'text',
                      ariaAttributes: true,
                    })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Default (Uncategorized)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <input type="hidden" name="imageAction" value={imageActionState} />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Image</label>
                    <Text size="xs" className="text-muted-foreground">
                      Paste, upload, or use a link.
                    </Text>
                  </div>

                  <div
                    className="overflow-hidden rounded-lg border bg-muted/40"
                    onPaste={handlePasteImage}
                  >
                    {imagePreview ? (
                      <img
                        key={`${imagePreview}-${previewVersion}`}
                        src={`${imagePreview}${imagePreview.includes('?') ? '&' : '?'}v=${previewVersion}`}
                        alt={
                          wishlistItem?.title ??
                          fields.title.value ??
                          fields.title.defaultValue ??
                          'Wishlist item image'
                        }
                        className="h-full w-full max-h-64 object-cover"
                        onError={() => setImageError('Image failed to load')}
                      />
                    ) : (
                      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <LuImage className="h-5 w-5" aria-hidden />
                        No image selected
                      </div>
                    )}
                  </div>
                  {imageError ? (
                    <Text size="sm" className="text-destructive">
                      {imageError}
                    </Text>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      {...getInputProps(fields.imageFile, {
                        type: 'file',
                        ariaAttributes: true,
                      })}
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="sm:w-40"
                    >
                      <LuUpload className="mr-2 h-4 w-4" aria-hidden />
                      Upload or paste
                    </Button>
                  </div>
                  {fields.imageFile.errors?.length ? (
                    <Text size="sm" className="text-destructive">
                      {fields.imageFile.errors.join(', ')}
                    </Text>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      {...getInputProps(fields.imageUrl, {
                        type: 'url',
                        ariaAttributes: true,
                      })}
                      placeholder="https://example.com/image.jpg"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      name="intent"
                      value="save"
                      onClick={() => setImageActionState('url')}
                    >
                      <LuLink2 className="mr-2 h-4 w-4" aria-hidden />
                      Use image link
                    </Button>
                  </div>
                  {fields.imageUrl.errors?.length ? (
                    <Text size="sm" className="text-destructive">
                      {fields.imageUrl.errors.join(', ')}
                    </Text>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="secondary"
                      name="intent"
                      value="save"
                      onClick={() => setImageActionState('auto-detect')}
                      disabled={!fields.url.value}
                    >
                      Auto-detect image
                    </Button>
                    <Button
                      type="submit"
                      variant="outline"
                      name="intent"
                      value="save"
                      onClick={() => setImageActionState('remove')}
                      disabled={!wishlistItem?.hasImage && imageActionState !== 'upload'}
                    >
                      Remove image
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={triggerImageRetry}
                      disabled={!imagePreview}
                    >
                      Retry loading
                    </Button>
                  </div>
                </div>

                <DialogFooter className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
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
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setImageActionState((current) =>
                        current === 'upload' && fileInputRef.current?.files?.length
                          ? current
                          : 'none',
                      )
                    }
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
                      className="col-span-2 w-full sm:col-span-1 sm:w-auto"
                      onClick={() =>
                        setImageActionState((current) =>
                          current === 'upload' && fileInputRef.current?.files?.length
                            ? current
                            : 'none',
                        )
                      }
                    >
                      Save & Add Another
                    </StatusButton>
                  ) : null}
                </DialogFooter>
              </Form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);

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
