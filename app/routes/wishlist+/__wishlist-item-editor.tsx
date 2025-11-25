// __wishlist-item-editor.tsx
import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type WishlistItem } from '@prisma/client';
import { Form, useActionData } from '@remix-run/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuExternalLink,
  LuImage,
  LuLoader,
  LuPlus,
  LuUpload,
  LuX,
} from 'react-icons/lu';
import { z } from 'zod';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Field, TextareaField } from '#app/components/forms.tsx';
import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import { Icon } from '#app/components/ui/icon';
import { Input } from '#app/components/ui/input';
import {
  MobileBottomSheet,
  MobileBottomSheetTrigger,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetTitle,
  MobileBottomSheetFooter,
  MobileBottomSheetClose,
  MobileBottomSheetDescription,
} from '#app/components/ui/mobile-bottom-sheet';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Flex, Text } from '#app/components/ui-kit';
import { getWishlistItemImgSrc, useIsPending } from '#app/utils/misc.tsx';
import { type Toast } from '#app/utils/toast.server.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import { type action } from './__wishlist-item-editor.server';

const valueMinLength = 1;
const valueMaxLength = 255;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

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

const getSafePreviewSrc = (value: string | null) => {
  if (!value) return null;
  if (value.startsWith('/')) return value;
  if (value.startsWith('blob:')) return value;
  try {
    const parsed = new URL(value);
    if (SAFE_IMAGE_PROTOCOLS.has(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
};

type EditorProps = {
  wishlistItem?: Pick<
    WishlistItem,
    'id' | 'title' | 'url' | 'note' | 'type' | 'categoryId' | 'updatedAt'
  > &
    Partial<{
      hasImage: boolean;
      imageSource: WishlistItemImageSource | null;
    }>;
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
    const shouldResetForm =
      actionData?.intent === 'save-add-another' &&
      actionData?.result?.status === 'success';
    const isPending = useIsPending();
    const formRef = useRef<HTMLFormElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentImageSrc = useMemo(() => {
      if (!(wishlistItem?.hasImage && wishlistItem?.id)) return null;
      const base = getWishlistItemImgSrc(wishlistItem.id);
      const version = wishlistItem.updatedAt
        ? new Date(wishlistItem.updatedAt).getTime()
        : 0;
      return `${base}${base?.includes('?') ? '&' : '?'}v=${version}`;
    }, [wishlistItem?.hasImage, wishlistItem?.id, wishlistItem?.updatedAt]);
    const [imageActionState, setImageActionState] =
      useState<z.infer<typeof ImageActionSchema>>('none');
    const [imagePreview, setImagePreview] = useState<string | null>(
      currentImageSrc,
    );
    const [previewVersion, setPreviewVersion] = useState(0);
    const [imageError, setImageError] = useState<string | null>(null);
    const [imageWarning, setImageWarning] = useState<string | null>(null);
    const [hasPendingImageChange, setHasPendingImageChange] = useState(false);
    const [isImageLoading, setIsImageLoading] = useState(false);
    const [imageUrlValue, setImageUrlValue] = useState('');
    const initialValuesRef = useRef({
      title: wishlistItem?.title ?? '',
      url: wishlistItem?.url ?? '',
      note: wishlistItem?.note ?? '',
      categoryId: wishlistItem?.categoryId ?? defaultCategoryId ?? '',
      type: wishlistItem?.type ?? 'text',
      hasImage: wishlistItem?.hasImage ?? false,
      updatedAt: wishlistItem?.updatedAt ?? null,
    });

    useToast(actionData?.toast);

    const formId = React.useId();

    const [form, fields] = useForm<z.input<typeof WishlistItemSchema>>({
      id: formId,
      constraint: getZodConstraint(WishlistItemSchema),
      lastResult: shouldResetForm ? undefined : (actionData?.result as any),
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

    const imageFileInputProps = getInputProps(fields.imageFile, {
      type: 'file',
      ariaAttributes: true,
    });
    const imageUrlInputProps = getInputProps(fields.imageUrl, {
      type: 'url',
      ariaAttributes: true,
    });

    useEffect(() => {
      setImagePreview(currentImageSrc);
      setImageActionState('none');
      setHasPendingImageChange(false);
      setImageWarning(null);
      setImageError(null);
      setImageUrlValue('');
      initialValuesRef.current = {
        title: wishlistItem?.title ?? '',
        url: wishlistItem?.url ?? '',
        note: wishlistItem?.note ?? '',
        categoryId: wishlistItem?.categoryId ?? defaultCategoryId ?? '',
        type: wishlistItem?.type ?? 'text',
        hasImage: wishlistItem?.hasImage ?? false,
        updatedAt: wishlistItem?.updatedAt ?? null,
      };
    }, [
      currentImageSrc,
      wishlistItem?.title,
      wishlistItem?.url,
      wishlistItem?.note,
      wishlistItem?.categoryId,
      wishlistItem?.type,
      wishlistItem?.hasImage,
      wishlistItem?.updatedAt,
      defaultCategoryId,
    ]);

    useEffect(() => {
      if (actionData?.imageError) {
        setImageError(actionData.imageError);
        if (actionData.imageAction === 'none' && !currentImageSrc) {
          setImageWarning(actionData.imageError);
        }
      }

      if (actionData?.result?.status === 'success') {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setHasPendingImageChange(false);
        setImageActionState('none');
        setImageWarning(null);
        setImageError(null);
        setImageUrlValue('');
        setPreviewVersion((v) => v + 1);
        const nextValue =
          actionData?.result &&
          actionData.result.status === 'success' &&
          'value' in actionData.result
            ? (
                actionData.result as {
                  value: z.infer<typeof WishlistItemSchema>;
                }
              ).value
            : null;
        initialValuesRef.current = shouldResetForm
          ? {
              title: '',
              url: '',
              note: '',
              categoryId: (nextValue?.categoryId ??
                initialValuesRef.current.categoryId ??
                defaultCategoryId ??
                '') as string,
              type: nextValue?.type ?? initialValuesRef.current.type,
              hasImage: false,
              updatedAt: null,
            }
          : {
              title: nextValue?.title ?? initialValuesRef.current.title,
              url: nextValue?.url ?? initialValuesRef.current.url,
              note: nextValue?.note ?? initialValuesRef.current.note,
              categoryId: (nextValue?.categoryId ??
                initialValuesRef.current.categoryId ??
                '') as string,
              type: nextValue?.type ?? initialValuesRef.current.type,
              hasImage:
                (nextValue as any)?.hasImage ??
                wishlistItem?.hasImage ??
                initialValuesRef.current.hasImage,
              updatedAt:
                wishlistItem?.updatedAt ?? initialValuesRef.current.updatedAt,
            };

        if (shouldResetForm) {
          formRef.current?.reset();
          setImagePreview(currentImageSrc);
        }
        if (actionData.intent === 'save') setOpen(false);
      }
    }, [
      actionData,
      currentImageSrc,
      defaultCategoryId,
      shouldResetForm,
      wishlistItem?.hasImage,
      wishlistItem?.updatedAt,
    ]);

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
      setImageWarning(null);
      setHasPendingImageChange(true);
    };

    const handleRemoveImage = () => {
      setImageActionState('remove');
      setImagePreview(null);
      setImageError(null);
      setImageWarning(null);
      setHasPendingImageChange(true);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    const titleText =
      mode === 'view'
        ? 'Wishlist Item'
        : hasId
          ? 'Edit Wishlist Item'
          : 'Add Wishlist Item';
    const normalize = (value: string | null | undefined) => value ?? '';
    const titleValue = normalize(
      fields.title.value ?? fields.title.defaultValue ?? '',
    );
    const urlValue = normalize(
      fields.url.value ?? fields.url.defaultValue ?? '',
    );
    const noteValue = normalize(
      fields.note.value ?? fields.note.defaultValue ?? '',
    );
    const categoryValue = normalize(
      (fields.categoryId.value ??
        fields.categoryId.defaultValue ??
        '') as string,
    );
    const typeValue = normalize(
      fields.type.value ??
        fields.type.defaultValue ??
        initialValuesRef.current.type,
    );
    const hasFieldChanges =
      titleValue !== normalize(initialValuesRef.current.title) ||
      urlValue !== normalize(initialValuesRef.current.url) ||
      noteValue !== normalize(initialValuesRef.current.note) ||
      categoryValue !== normalize(initialValuesRef.current.categoryId ?? '') ||
      typeValue !== normalize(initialValuesRef.current.type);
    const hasImageChanges =
      hasPendingImageChange ||
      imageActionState === 'remove' ||
      imageActionState === 'url';
    const isDirty = hasFieldChanges || hasImageChanges;
    const saveDisabled = isPending || !isDirty;
    const showImageError = Boolean(imageError && !imageWarning);
    const previewSrc = React.useMemo(() => {
      const safePreview = getSafePreviewSrc(imagePreview);
      if (!safePreview) return null;
      if (safePreview.startsWith('blob:')) return safePreview;
      const separator = safePreview.includes('?') ? '&' : '?';
      return `${safePreview}${separator}v=${previewVersion}`;
    }, [imagePreview, previewVersion]);

    const applyUrlPreview = React.useCallback(
      (rawValue: string) => {
        const value = rawValue.trim();
        setImageUrlValue(value);
        if (!value) {
          setImageActionState('none');
          setHasPendingImageChange(false);
          setImagePreview(currentImageSrc);
          setImageError(null);
          setImageWarning(null);
          return;
        }
        const safePreview = getSafePreviewSrc(value);
        if (!safePreview) {
          setImageActionState('none');
          setHasPendingImageChange(false);
          setImagePreview(currentImageSrc);
          setImageError('Enter a valid http(s) image URL');
          setImageWarning(null);
          return;
        }
        setImageActionState('url');
        setHasPendingImageChange(true);
        setImagePreview(safePreview);
        setPreviewVersion((v) => v + 1);
        setImageError(null);
        setImageWarning(null);
      },
      [currentImageSrc],
    );

    useEffect(() => {
      if (previewSrc) {
        setIsImageLoading(true);
      } else {
        setIsImageLoading(false);
      }
    }, [previewSrc]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const [file] = Array.from(event.target.files ?? []);
      if (!file) {
        setImageActionState('none');
        setImagePreview(currentImageSrc);
        setHasPendingImageChange(false);
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setImageActionState('none');
        setImagePreview(currentImageSrc);
        setImageError('Images must be 10MB or smaller');
        setImageWarning(null);
        setHasPendingImageChange(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      setImageActionState('upload');
      setImagePreview(URL.createObjectURL(file));
      setImageError(null);
      setImageWarning(null);
      setHasPendingImageChange(true);
    };

    const prepareImageActionForSave = () => {
      const imageUrlValue = fields.imageUrl.value?.trim();
      setImageActionState((current) => {
        if (fileInputRef.current?.files?.length) return 'upload';
        if (current === 'remove') return 'remove';
        if (current === 'url' || imageUrlValue) return 'url';
        return 'none';
      });
    };

    return (
      <MobileBottomSheet open={open} onOpenChange={setOpen}>
        {trigger ? (
          <MobileBottomSheetTrigger asChild>
            {trigger}
          </MobileBottomSheetTrigger>
        ) : !wishlistItem ? (
          <>
            {/* Desktop add button */}
            <MobileBottomSheetTrigger asChild>
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
            </MobileBottomSheetTrigger>
            {/* Mobile FAB add button */}
            {!open && (
              <MobileBottomSheetTrigger asChild>
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
              </MobileBottomSheetTrigger>
            )}
          </>
        ) : null}

        {/* Optional: ensure dialog can fit our inner width comfortably */}
        <MobileBottomSheetContent className="p-5 sm:max-w-[36rem] sm:p-6">
          <MobileBottomSheetHeader>
            <MobileBottomSheetTitle>{titleText}</MobileBottomSheetTitle>
            <MobileBottomSheetDescription className="sr-only">
              Update wishlist item details
            </MobileBottomSheetDescription>
          </MobileBottomSheetHeader>

          {/* Shared width container for BOTH modes */}
          <div className="mx-auto w-full sm:w-[28rem]">
            {mode === 'view' ? (
              <div className="flex flex-col gap-5">
                {wishlistItem?.hasImage ? (
                  <div className="overflow-hidden rounded-lg border bg-muted/40">
                    <img
                      src={`${getWishlistItemImgSrc(wishlistItem.id)}`}
                      alt={wishlistItem.title}
                      className="h-full max-h-80 w-full object-cover"
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

                {viewExtras ? (
                  <div className="rounded-lg bg-muted/50 p-4">{viewExtras}</div>
                ) : null}

                <MobileBottomSheetFooter className="grid gap-3 sm:flex sm:justify-end sm:space-x-2">
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

                  <MobileBottomSheetClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="hidden sm:inline-flex"
                    >
                      Close
                    </Button>
                  </MobileBottomSheetClose>
                </MobileBottomSheetFooter>
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

                <input
                  type="hidden"
                  name="imageAction"
                  value={imageActionState}
                />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Image</label>
                    <Text size="xs" className="text-muted-foreground">
                      Upload or paste. Max 10MB; stored images are compressed.
                    </Text>
                  </div>

                  <div className="space-y-2">
                    <div
                      className="relative min-h-[12rem] cursor-pointer overflow-hidden rounded-lg border bg-muted/40"
                      onPaste={handlePasteImage}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {imagePreview ? (
                        <>
                          <img
                            key={`${imagePreview}-${previewVersion}`}
                            src={previewSrc ?? undefined}
                            alt={
                              wishlistItem?.title ??
                              fields.title.value ??
                              fields.title.defaultValue ??
                              'Wishlist item image'
                            }
                            className="h-full max-h-64 w-full object-cover"
                            onLoad={() => setIsImageLoading(false)}
                            onError={() => {
                              setIsImageLoading(false);
                              setImageError('Image failed to load');
                            }}
                          />
                          {isImageLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                              <LuLoader className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : null}
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute right-2 top-2 h-8 w-8 rounded-full bg-background/90 shadow-md hover:bg-background"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveImage();
                            }}
                            aria-label="Remove image"
                          >
                            <LuX className="h-4 w-4" aria-hidden />
                          </Button>
                        </>
                      ) : (
                        <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                          <LuImage className="h-6 w-6" aria-hidden />
                          <div className="text-center text-sm text-muted-foreground">
                            Upload an image here or paste a URL/image below.
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <LuUpload className="mr-2 h-4 w-4" aria-hidden />
                            Upload image
                          </Button>
                        </div>
                      )}
                    </div>
                    <Input
                      {...imageFileInputProps}
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                    {fields.imageFile.errors?.length ? (
                      <Text size="sm" className="text-destructive">
                        {fields.imageFile.errors.join(', ')}
                      </Text>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Input
                      {...imageUrlInputProps}
                      placeholder="Paste an image URL or paste an image directly"
                      value={imageUrlValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        setImageUrlValue(value);
                        setImageActionState(value ? 'url' : 'none');
                        setHasPendingImageChange(Boolean(value));
                        setImageError(null);
                        setImageWarning(null);
                      }}
                      onPaste={(event) => {
                        const [file] = Array.from(
                          event.clipboardData?.files ?? [],
                        ).filter((f) => f.type.startsWith('image/'));
                        if (file) {
                          event.preventDefault();
                          const transfer = new DataTransfer();
                          transfer.items.add(file);
                          if (fileInputRef.current) {
                            fileInputRef.current.files = transfer.files;
                          }
                          setImageActionState('upload');
                          setImagePreview(URL.createObjectURL(file));
                          setHasPendingImageChange(true);
                          setImageError(null);
                          setImageWarning(null);
                          return;
                        }
                        const target = event.currentTarget;
                        setTimeout(() => {
                          applyUrlPreview(target.value);
                          setImageUrlValue(target.value);
                        });
                      }}
                      onBlur={(event) => {
                        if (event.target.value.trim()) {
                          applyUrlPreview(event.target.value);
                          setImageUrlValue(event.target.value);
                        }
                      }}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Paste an image URL or paste an image file into this
                        field.
                      </span>
                    </div>
                  </div>
                  {fields.imageUrl.errors?.length ? (
                    <Text size="sm" className="text-destructive">
                      {fields.imageUrl.errors.join(', ')}
                    </Text>
                  ) : null}
                  {showImageError ? (
                    <Text size="sm" className="text-destructive">
                      {imageError}
                    </Text>
                  ) : null}
                  {imageWarning ? (
                    <Text size="sm" className="text-amber-600">
                      {imageWarning}
                    </Text>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setImageActionState('none');
                        setImagePreview(currentImageSrc);
                        setHasPendingImageChange(false);
                        setImageError(null);
                        setImageWarning(null);
                        setImageUrlValue('');
                        if (fileInputRef.current)
                          fileInputRef.current.value = '';
                      }}
                      disabled={
                        !hasPendingImageChange &&
                        imagePreview === currentImageSrc
                      }
                    >
                      Reset image change
                    </Button>
                  </div>
                </div>

                <MobileBottomSheetFooter className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                  <MobileBottomSheetClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                  </MobileBottomSheetClose>

                  <StatusButton
                    form={form.id}
                    type="submit"
                    disabled={saveDisabled}
                    status={isPending ? 'pending' : 'idle'}
                    variant="secondary"
                    name="intent"
                    value="save"
                    className="w-full sm:w-auto"
                    onClick={prepareImageActionForSave}
                  >
                    Save
                  </StatusButton>

                  {mode === 'create' ? (
                    <StatusButton
                      form={form.id}
                      type="submit"
                      disabled={saveDisabled}
                      status={isPending ? 'pending' : 'idle'}
                      variant="default"
                      name="intent"
                      value="save-add-another"
                      className="col-span-2 w-full sm:col-span-1 sm:w-auto"
                      onClick={prepareImageActionForSave}
                    >
                      Save & Add Another
                    </StatusButton>
                  ) : null}
                </MobileBottomSheetFooter>
              </Form>
            )}
          </div>
        </MobileBottomSheetContent>
      </MobileBottomSheet>
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
