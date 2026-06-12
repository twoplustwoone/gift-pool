// __wishlist-item-editor.tsx
import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type WishlistItem } from '@prisma/client';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LuArchive,
  LuExternalLink,
  LuGift,
  LuImage,
  LuListChecks,
  LuInfo,
  LuLoader,
  LuPlus,
  LuUpload,
  LuX,
} from 'react-icons/lu';
import { Form, useActionData, useFetcher } from 'react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { Field, TextareaField } from '#app/components/forms.tsx';
import { useToast } from '#app/components/toaster.tsx';
import { Button } from '#app/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#app/components/ui/dialog';
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
import { track } from '#app/utils/analytics.client.ts';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';
import { cn, getWishlistItemImgSrc, useIsPending } from '#app/utils/misc.tsx';
import { dollarsToCents } from '#app/utils/price.ts';
import { useOptionalRequestInfo } from '#app/utils/request-info.ts';
import { type Toast } from '#app/utils/toast.server.ts';
import { type WishlistItemImageSource } from '#app/utils/wishlist-images.server.ts';
import { type WishlistItemStatusValue } from '#app/utils/wishlist.ts';
import { type action as unfurlAction } from '../api.wishlist.unfurl.ts';
import { type action } from './__wishlist-item-editor.server';

const valueMinLength = 1;
const valueMaxLength = 255;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * High-confidence URL patterns that indicate an external wishlist/registry,
 * not a single product page. Used for the "Looks like a list — switch to
 * List link?" inline suggestion. False-positive rate must be near zero,
 * so we only match known wishlist paths, not generic e-commerce domains.
 */
const WISHLIST_URL_PATTERNS: RegExp[] = [
  // Amazon wishlist — /hz/wishlist/ls/<id> or /gp/registry/wishlist/<id>
  /amazon\.[a-z.]+\/hz\/wishlist\/ls\//i,
  /amazon\.[a-z.]+\/gp\/registry\/wishlist\//i,
  // Steam wishlist — store.steampowered.com/wishlist/id/<id>/ or /profiles/<id>/wishlist
  /store\.steampowered\.com\/wishlist\//i,
  // MyRegistry.com
  /myregistry\.com\/giftlist\//i,
  // The Knot registry
  /theknot\.com\/registry\//i,
  // Babylist registry
  /babylist\.com\/list\//i,
  // Target registry
  /target\.com\/gift-registry\//i,
  // Zola registry
  /zola\.com\/registry\//i,
];

export function looksLikeWishlistUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    return WISHLIST_URL_PATTERNS.some((pattern) => pattern.test(url));
  } catch {
    return false;
  }
}

const ImageActionSchema = z
  .enum(['none', 'upload', 'url', 'auto-detect', 'remove'])
  .default('none');

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 640px)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)');

    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
};

export const WishlistItemSchema = z
  .object({
    id: z.string().optional(),
    categoryId: z.string().nullable().optional(),
    title: z.string().min(valueMinLength).max(valueMaxLength),
    note: z.string().optional(),
    url: z.string().url().optional(),
    type: z.enum(['text', 'link', 'wishlist']).default('text'),
    // Dollars in the input, cents out of the schema.
    price: z.preprocess(
      (value) => (value === '' || value == null ? undefined : value),
      z.coerce
        .number()
        .min(0)
        .max(1_000_000)
        .transform(dollarsToCents)
        .optional(),
    ),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    // Enrichment bookkeeping (hidden inputs) — analytics only, never persisted.
    enrichedFields: z.string().max(64).optional(),
    enrichmentEdited: z.string().optional(),
    imageAction: ImageActionSchema,
    imageUrl: z.string().url().optional(),
    imageFile: z.instanceof(File).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'wishlist' && !data.url?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'A URL is required for list links',
      });
    }
  });

type WishlistItemType = 'text' | 'link' | 'wishlist';

function EditorTypeSelector({
  isListLinkType,
  resetImageChanges,
  setItemType,
}: Readonly<{
  isListLinkType: boolean;
  resetImageChanges: () => void;
  setItemType: React.Dispatch<React.SetStateAction<WishlistItemType>>;
}>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">What are you adding?</span>
      <div className="flex rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setItemType('text')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
            isListLinkType
              ? 'text-muted-foreground hover:text-foreground'
              : 'bg-background text-foreground shadow-sm',
          )}
        >
          <LuGift className="h-3.5 w-3.5" aria-hidden />
          Gift idea
        </button>
        <button
          type="button"
          onClick={() => {
            setItemType('wishlist');
            resetImageChanges();
          }}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
            isListLinkType
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <LuListChecks className="h-3.5 w-3.5" aria-hidden />
          List link
        </button>
      </div>
      {isListLinkType ? (
        <p className="text-xs text-muted-foreground">
          Links to an external collection (Amazon wishlist, Steam list, etc.).
          Friends can browse it — list links can&apos;t be claimed.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          One specific thing you&apos;d like. Paste a product link below and
          we&apos;ll fill in the details.
        </p>
      )}
    </div>
  );
}

function UrlFieldWithSuggestion({
  errors,
  inputProps,
  labelText,
  onAcceptSuggestion,
  onDismissSuggestion,
  showSuggestion,
}: Readonly<{
  errors: string[] | undefined;
  inputProps: React.ComponentProps<'input'>;
  labelText: string;
  onAcceptSuggestion: () => void;
  onDismissSuggestion: () => void;
  showSuggestion: boolean;
}>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Field
        className="w-full"
        labelProps={{ children: labelText }}
        inputProps={inputProps}
        errors={errors}
      />
      {showSuggestion ? (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <LuInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1">
            Looks like an external wishlist. Switch to{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2 hover:no-underline"
              onClick={onAcceptSuggestion}
            >
              List link
            </button>
            {'?'}
          </span>
          <button
            type="button"
            aria-label="Dismiss suggestion"
            className="shrink-0 opacity-60 hover:opacity-100"
            onClick={onDismissSuggestion}
          >
            <LuX className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function getEditorFieldConfig(isListLink: boolean) {
  return {
    titleLabel: isListLink ? 'List name' : 'Title',
    titlePlaceholder: isListLink ? 'My Amazon Wishlist' : 'Title for your item',
    urlLabel: isListLink ? 'List URL' : 'Link',
    urlPlaceholder: isListLink
      ? 'https://www.amazon.com/hz/wishlist/…'
      : 'https://amazon.com/',
    noteLabel: isListLink ? 'Note for friends' : 'Description',
    notePlaceholder: isListLink
      ? 'e.g. Anything in the kitchen section works for me'
      : 'Describe the item...',
  };
}

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
  wishlistItem?: (Pick<
    WishlistItem,
    | 'id'
    | 'title'
    | 'url'
    | 'note'
    | 'type'
    | 'categoryId'
    | 'updatedAt'
    | 'status'
  > & { status: WishlistItemStatusValue }) &
    Partial<{
      hasImage: boolean;
      imageSource: WishlistItemImageSource | null;
      priceCents: number | null;
      currency: string | null;
    }>;
  trigger?: React.ReactNode;
  initialMode?: 'auto' | 'view' | 'edit' | 'create';
  canEdit?: boolean;
  categories?: { id: string; name: string }[];
  defaultCategoryId?: string | null;
  viewExtras?: React.ReactNode;
  showDefaultTrigger?: boolean;
  hideFloatingTrigger?: boolean;
  onStatusChange?: (
    itemId: string,
    status: WishlistItemStatusValue,
  ) => boolean | void;
};

type WishlistItemEditorActionData =
  | {
      result: SubmissionResult<z.infer<typeof WishlistItemSchema>>;
      intent?: 'save' | 'save-add-another';
      toast?: Toast | null;
      imageError?: string | null;
      imageAction?: z.infer<typeof ImageActionSchema>;
      analyticsEventId?: string | null;
      requestId?: string;
      clientMutationId?: string | null;
    }
  | undefined;

type EditorInitialValues = {
  title: string;
  url: string;
  note: string;
  price: string;
  categoryId: string;
  type: string;
  hasImage: boolean;
  updatedAt: WishlistItem['updatedAt'] | null;
};
type EditorMode = 'view' | 'edit' | 'create';
type DialogComponentSet = {
  DialogRoot: typeof Dialog | typeof MobileBottomSheet;
  DialogTriggerComponent:
    | typeof DialogTrigger
    | typeof MobileBottomSheetTrigger;
  DialogContentComponent:
    | typeof DialogContent
    | typeof MobileBottomSheetContent;
  DialogHeaderComponent: typeof DialogHeader | typeof MobileBottomSheetHeader;
  DialogFooterComponent: typeof DialogFooter | typeof MobileBottomSheetFooter;
  DialogTitleComponent: typeof DialogTitle | typeof MobileBottomSheetTitle;
  DialogDescriptionComponent:
    | typeof DialogDescription
    | typeof MobileBottomSheetDescription;
  DialogCloseComponent: typeof DialogClose | typeof MobileBottomSheetClose;
};
type EditorModeController = {
  hasId: boolean;
  mode: EditorMode;
  open: boolean;
  openCreate: () => void;
  openEdit: () => void;
  openView: WishlistItemEditorHandle['openView'];
  setMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};
type EditorStatusController = {
  currentStatus: WishlistItemStatusValue;
  handleStatusChange: (status: WishlistItemStatusValue) => void;
  statusError: string | null;
  statusPending: boolean;
  toggleLabel: string;
  toggleStatus: WishlistItemStatusValue;
  ToggleIcon: typeof LuArchive | typeof LuListChecks;
};
type EditorImageController = {
  applyUrlPreview: (rawValue: string) => void;
  currentImageSrc: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePasteImage: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  handleRemoveImage: () => void;
  hasPendingImageChange: boolean;
  imageActionState: z.infer<typeof ImageActionSchema>;
  imageError: string | null;
  imagePreview: string | null;
  imageUrlValue: string;
  imageWarning: string | null;
  isImageLoading: boolean;
  previewSrc: string | null;
  prepareImageActionForSave: () => void;
  previewVersion: number;
  resetImageChanges: () => void;
  setHasPendingImageChange: React.Dispatch<React.SetStateAction<boolean>>;
  setImageActionState: React.Dispatch<
    React.SetStateAction<z.infer<typeof ImageActionSchema>>
  >;
  setImageError: React.Dispatch<React.SetStateAction<string | null>>;
  setImagePreview: React.Dispatch<React.SetStateAction<string | null>>;
  setImageUrlValue: React.Dispatch<React.SetStateAction<string>>;
  setImageWarning: React.Dispatch<React.SetStateAction<string | null>>;
  setIsImageLoading: React.Dispatch<React.SetStateAction<boolean>>;
  shouldResetForm: boolean;
  showImageError: boolean;
};

function getEditorDialogComponents(isDesktop: boolean): DialogComponentSet {
  return {
    DialogRoot: isDesktop ? Dialog : MobileBottomSheet,
    DialogTriggerComponent: isDesktop
      ? DialogTrigger
      : MobileBottomSheetTrigger,
    DialogContentComponent: isDesktop
      ? DialogContent
      : MobileBottomSheetContent,
    DialogHeaderComponent: isDesktop ? DialogHeader : MobileBottomSheetHeader,
    DialogFooterComponent: isDesktop ? DialogFooter : MobileBottomSheetFooter,
    DialogTitleComponent: isDesktop ? DialogTitle : MobileBottomSheetTitle,
    DialogDescriptionComponent: isDesktop
      ? DialogDescription
      : MobileBottomSheetDescription,
    DialogCloseComponent: isDesktop ? DialogClose : MobileBottomSheetClose,
  };
}

function getEditorTitle(
  mode: EditorMode,
  hasId: boolean,
  wishlistItem: EditorProps['wishlistItem'],
) {
  if (mode === 'view') {
    return wishlistItem?.title ?? 'Wishlist Item';
  }
  return hasId ? 'Edit Wishlist Item' : 'Add Wishlist Item';
}

function normalizeEditorFieldValue(value: string | null | undefined) {
  return value ?? '';
}

function useWishlistItemEditorMode(
  {
    canEdit,
    initialMode = 'auto',
    wishlistItem,
  }: Pick<EditorProps, 'canEdit' | 'initialMode' | 'wishlistItem'>,
  ref: React.ForwardedRef<WishlistItemEditorHandle>,
): EditorModeController {
  const hasId = Boolean(wishlistItem?.id);
  const computedInitial = resolveInitialMode({
    canEdit: Boolean(canEdit),
    hasId,
    initialMode,
  });
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<EditorMode>(computedInitial);

  const openView: WishlistItemEditorHandle['openView'] = useCallback(
    ({ fromTrigger = false } = {}) => {
      setMode('view');
      if (!fromTrigger) setOpen(true);
    },
    [],
  );

  const openEdit = useCallback(() => {
    if (!canEdit) {
      openView();
      return;
    }
    setMode(hasId ? 'edit' : 'create');
    setOpen(true);
  }, [canEdit, hasId, openView]);

  const openCreate = useCallback(() => {
    setMode('create');
    setOpen(true);
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setOpen(true);
      },
      close: () => {
        setOpen(false);
      },
      toggle: () => {
        setOpen((value) => !value);
      },
      openView,
      openEdit,
      openCreate,
    }),
    [openCreate, openEdit, openView],
  );

  // Funnel entry for wishlist_item_added: fires once per open, when the
  // editor first enters an editable mode (so a view → edit transition still
  // counts, but mode flips while editing don't double-fire).
  const trackedOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      trackedOpenRef.current = false;
      return;
    }
    if (trackedOpenRef.current) return;
    if (mode !== 'create' && mode !== 'edit') return;
    trackedOpenRef.current = true;
    track('wishlist_editor_opened', {
      mode,
      // Distinguishes mobile from desktop opens — the June 2026 audit found
      // the mobile FAB hidden behind the feedback widget, so mobile opens
      // are the recovery signal to watch. 640px matches Tailwind's sm.
      viewport: window.innerWidth < 640 ? 'mobile' : 'desktop',
    });
  }, [open, mode]);

  return {
    hasId,
    mode,
    open,
    openCreate,
    openEdit,
    openView,
    setMode,
    setOpen,
  };
}

function useWishlistItemStatusController({
  onStatusChange,
  wishlistItem,
}: Pick<
  EditorProps,
  'onStatusChange' | 'wishlistItem'
>): EditorStatusController {
  const [currentStatus, setCurrentStatus] = useState<WishlistItemStatusValue>(
    wishlistItem?.status ?? 'ACTIVE',
  );
  const statusFetcher = useFetcher<{
    ok?: boolean;
    status?: WishlistItemStatusValue;
    error?: string;
    toast?: Toast;
  }>();
  const statusPending = statusFetcher.state !== 'idle';
  const statusError =
    statusFetcher.state === 'idle'
      ? (((statusFetcher.data as any)?.error as string | undefined) ?? null)
      : null;
  const toggleStatus = currentStatus === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
  const toggleLabel =
    currentStatus === 'ACTIVE' ? 'Remove from wishlist' : 'Restore to wishlist';
  const ToggleIcon = currentStatus === 'ACTIVE' ? LuArchive : LuListChecks;
  useToast((statusFetcher.data as any)?.toast);

  useEffect(() => {
    setCurrentStatus(wishlistItem?.status ?? 'ACTIVE');
  }, [wishlistItem?.id, wishlistItem?.status]);

  useEffect(() => {
    if (statusFetcher.state !== 'idle') return;
    if ((statusFetcher.data as any)?.ok) {
      const nextStatus =
        ((statusFetcher.data as any)?.status as WishlistItemStatusValue) ??
        currentStatus;
      setCurrentStatus(nextStatus);
    }
  }, [currentStatus, statusFetcher.data, statusFetcher.state]);

  const handleStatusChange = useCallback(
    (status: WishlistItemStatusValue) => {
      if (!wishlistItem?.id) return;
      setCurrentStatus(status);
      const shouldSubmit = onStatusChange?.(wishlistItem.id, status) !== false;
      const formData = new FormData();
      formData.set('intent', 'update-wishlist-item-status');
      formData.set('wishlistItemId', wishlistItem.id);
      formData.set('status', status);
      formData.set('clientMutationId', createClientMutationId());
      if (shouldSubmit) {
        Promise.resolve(
          statusFetcher.submit(formData, {
            method: 'post',
            action: '/wishlist/status',
          }),
        ).catch(() => {});
      }
    },
    [onStatusChange, statusFetcher, wishlistItem],
  );

  return {
    currentStatus,
    handleStatusChange,
    statusError,
    statusPending,
    toggleLabel,
    toggleStatus,
    ToggleIcon,
  };
}

function resetEditorImageState({
  currentImageSrc,
  setHasPendingImageChange,
  setImageActionState,
  setImageError,
  setImagePreview,
  setImageUrlValue,
  setImageWarning,
}: Pick<
  EditorImageController,
  | 'currentImageSrc'
  | 'setHasPendingImageChange'
  | 'setImageActionState'
  | 'setImageError'
  | 'setImagePreview'
  | 'setImageUrlValue'
  | 'setImageWarning'
>) {
  setImageActionState('none');
  setHasPendingImageChange(false);
  setImagePreview(currentImageSrc);
  setImageError(null);
  setImageWarning(null);
  setImageUrlValue('');
}

function applyEditorFilePreview(
  file: File,
  {
    currentImageSrc,
    fileInputRef,
    setHasPendingImageChange,
    setImageActionState,
    setImageError,
    setImagePreview,
    setImageWarning,
  }: Pick<
    EditorImageController,
    | 'currentImageSrc'
    | 'fileInputRef'
    | 'setHasPendingImageChange'
    | 'setImageActionState'
    | 'setImageError'
    | 'setImagePreview'
    | 'setImageWarning'
  >,
) {
  if (file.size > MAX_UPLOAD_BYTES) {
    resetEditorImageState({
      currentImageSrc,
      setHasPendingImageChange,
      setImageActionState,
      setImageError,
      setImagePreview,
      setImageUrlValue: () => {},
      setImageWarning,
    });
    setImageError('Images must be 10MB or smaller');
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
}

function useWishlistItemEditorImageState({
  actionData,
  defaultCategoryId,
  formRef,
  setOpen,
  wishlistItem,
}: {
  actionData: WishlistItemEditorActionData;
  defaultCategoryId: string | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  wishlistItem: EditorProps['wishlistItem'];
}): EditorImageController {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialValuesRef = useRef(
    buildInitialValues({
      defaultCategoryId,
      wishlistItem,
    }),
  );
  const shouldResetForm =
    actionData?.intent === 'save-add-another' &&
    actionData?.result?.status === 'success';

  useEffect(() => {
    setImagePreview(currentImageSrc);
    setImageActionState('none');
    setHasPendingImageChange(false);
    setImageWarning(null);
    setImageError(null);
    setImageUrlValue('');
    initialValuesRef.current = buildInitialValues({
      defaultCategoryId,
      wishlistItem,
    });
  }, [
    currentImageSrc,
    defaultCategoryId,
    wishlistItem,
    wishlistItem?.categoryId,
    wishlistItem?.hasImage,
    wishlistItem?.note,
    wishlistItem?.title,
    wishlistItem?.type,
    wishlistItem?.updatedAt,
    wishlistItem?.url,
  ]);

  useSubmissionImageSync({
    actionData,
    currentImageSrc,
    defaultCategoryId,
    fileInputRef,
    initialValuesRef,
    setHasPendingImageChange,
    setImageActionState,
    setImageError,
    setImageUrlValue,
    setImageWarning,
    setOpen,
    setPreviewVersion,
    shouldResetForm,
    wishlistItem,
  });

  useEffect(() => {
    if (!shouldResetForm) return;
    if (actionData?.result?.status !== 'success') return;
    formRef.current?.reset();
    setImagePreview(currentImageSrc);
  }, [actionData?.result?.status, currentImageSrc, formRef, shouldResetForm]);

  const applyUrlPreview = useCallback(
    (rawValue: string) => {
      const value = rawValue.trim();
      setImageUrlValue(value);
      if (!value) {
        resetEditorImageState({
          currentImageSrc,
          setHasPendingImageChange,
          setImageActionState,
          setImageError,
          setImagePreview,
          setImageUrlValue,
          setImageWarning,
        });
        return;
      }
      const safePreview = getSafePreviewSrc(value);
      if (!safePreview) {
        resetEditorImageState({
          currentImageSrc,
          setHasPendingImageChange,
          setImageActionState,
          setImageError,
          setImagePreview,
          setImageUrlValue,
          setImageWarning,
        });
        setImageError('Enter a valid http(s) image URL');
        return;
      }
      setImageActionState('url');
      setHasPendingImageChange(true);
      setImagePreview(safePreview);
      setPreviewVersion((value) => value + 1);
      setImageError(null);
      setImageWarning(null);
    },
    [currentImageSrc],
  );

  const previewSrc = useMemo(() => {
    const safePreview = getSafePreviewSrc(imagePreview);
    if (!safePreview) return null;
    if (safePreview.startsWith('blob:')) return safePreview;
    const separator = safePreview.includes('?') ? '&' : '?';
    return `${safePreview}${separator}v=${previewVersion}`;
  }, [imagePreview, previewVersion]);

  useEffect(() => {
    setIsImageLoading(Boolean(previewSrc));
  }, [previewSrc]);

  const handlePasteImage = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
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
      applyEditorFilePreview(file, {
        currentImageSrc,
        fileInputRef,
        setHasPendingImageChange,
        setImageActionState,
        setImageError,
        setImagePreview,
        setImageWarning,
      });
    },
    [currentImageSrc],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const [file] = Array.from(event.target.files ?? []);
      if (!file) {
        resetEditorImageState({
          currentImageSrc,
          setHasPendingImageChange,
          setImageActionState,
          setImageError,
          setImagePreview,
          setImageUrlValue,
          setImageWarning,
        });
        return;
      }
      applyEditorFilePreview(file, {
        currentImageSrc,
        fileInputRef,
        setHasPendingImageChange,
        setImageActionState,
        setImageError,
        setImagePreview,
        setImageWarning,
      });
    },
    [currentImageSrc],
  );

  const handleRemoveImage = useCallback(() => {
    setImageActionState('remove');
    setImagePreview(null);
    setImageError(null);
    setImageWarning(null);
    setHasPendingImageChange(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const resetImageChanges = useCallback(() => {
    resetEditorImageState({
      currentImageSrc,
      setHasPendingImageChange,
      setImageActionState,
      setImageError,
      setImagePreview,
      setImageUrlValue,
      setImageWarning,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [currentImageSrc]);

  const prepareImageActionForSave = useCallback(() => {
    const nextImageUrlValue = imageUrlValue.trim();
    setImageActionState((current) => {
      if (fileInputRef.current?.files?.length) return 'upload';
      if (current === 'remove') return 'remove';
      if (current === 'url' || nextImageUrlValue) return 'url';
      return 'none';
    });
  }, [imageUrlValue]);

  return {
    applyUrlPreview,
    currentImageSrc,
    fileInputRef,
    handleFileChange,
    handlePasteImage,
    handleRemoveImage,
    hasPendingImageChange,
    imageActionState,
    imageError,
    imagePreview,
    imageUrlValue,
    imageWarning,
    isImageLoading,
    previewSrc,
    prepareImageActionForSave,
    previewVersion,
    resetImageChanges,
    setHasPendingImageChange,
    setImageActionState,
    setImageError,
    setImagePreview,
    setImageUrlValue,
    setImageWarning,
    setIsImageLoading,
    shouldResetForm,
    showImageError: Boolean(imageError && !imageWarning),
  };
}

type EnrichableField = 'title' | 'price';

type EditorEnrichmentController = {
  currencyValue: string;
  enrichedFieldsValue: string;
  enrichmentEdited: boolean;
  isUnfurling: boolean;
  markEdited: (field: EnrichableField) => void;
  requestUnfurl: (rawUrl: string) => void;
  showHint: boolean;
};

/**
 * Live "paste a link, get a complete item" enrichment. On URL blur/paste the
 * hook asks /api/wishlist/unfurl for page metadata and prefills title, price,
 * and image — but only into fields the user hasn't touched. Failures are
 * silent by design: the form just stays manual.
 */
function useUrlEnrichment({
  fields,
  form,
  formRef,
  imageController,
  isListLinkType,
  wishlistItem,
}: {
  fields: ReturnType<typeof useForm<z.input<typeof WishlistItemSchema>>>[1];
  form: ReturnType<typeof useForm<z.input<typeof WishlistItemSchema>>>[0];
  formRef: React.RefObject<HTMLFormElement | null>;
  imageController: EditorImageController;
  isListLinkType: boolean;
  wishlistItem: EditorProps['wishlistItem'];
}): EditorEnrichmentController {
  const fetcher = useFetcher<typeof unfurlAction>();
  const lastRequestedUrl = useRef<string | null>(null);
  const appliedForUrl = useRef<string | null>(null);
  const userEdited = useRef(new Set<EnrichableField>());
  const enrichedFieldsRef = useRef<string[]>([]);
  // form.update re-fires input events on the target field; this guard keeps
  // programmatic prefill from being recorded as a user edit.
  const applyingPrefill = useRef(false);
  const [currencyValue, setCurrencyValue] = useState(
    wishlistItem?.currency ?? '',
  );
  const [enrichedFieldsValue, setEnrichedFieldsValue] = useState('');
  const [enrichmentEdited, setEnrichmentEdited] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const readFieldValue = useCallback(
    (name: string) => {
      const element = formRef.current?.elements.namedItem(name);
      return element instanceof HTMLInputElement ? element.value.trim() : '';
    },
    [formRef],
  );

  const markEdited = useCallback((field: EnrichableField) => {
    if (applyingPrefill.current) return;
    userEdited.current.add(field);
    if (enrichedFieldsRef.current.includes(field)) {
      setEnrichmentEdited(true);
    }
  }, []);

  const requestUnfurl = useCallback(
    (rawUrl: string) => {
      if (isListLinkType) return;
      const url = rawUrl.trim();
      if (!url) return;
      try {
        const protocol = new URL(url).protocol;
        if (protocol !== 'http:' && protocol !== 'https:') return;
      } catch {
        return;
      }
      if (url === lastRequestedUrl.current) return;
      lastRequestedUrl.current = url;
      void fetcher.submit(
        { url },
        { method: 'POST', action: '/api/wishlist/unfurl' },
      );
    },
    [fetcher, isListLinkType],
  );

  const { applyUrlPreview, hasPendingImageChange, imageUrlValue } =
    imageController;
  const hasExistingImage = Boolean(wishlistItem?.hasImage);

  useEffect(() => {
    if (fetcher.state !== 'idle') return;
    const metadata = fetcher.data?.result;
    if (!metadata) return;
    if (appliedForUrl.current === lastRequestedUrl.current) return;
    appliedForUrl.current = lastRequestedUrl.current;

    const applied: string[] = [];
    applyingPrefill.current = true;
    if (
      metadata.title &&
      !readFieldValue(fields.title.name) &&
      !userEdited.current.has('title')
    ) {
      form.update({ name: fields.title.name, value: metadata.title });
      applied.push('title');
    }
    if (
      metadata.priceCents != null &&
      !readFieldValue(fields.price.name) &&
      !userEdited.current.has('price')
    ) {
      form.update({
        name: fields.price.name,
        value: formatPriceInputValue(metadata.priceCents),
      });
      if (metadata.currency) setCurrencyValue(metadata.currency);
      applied.push('price');
    }
    if (
      metadata.imageUrl &&
      !hasPendingImageChange &&
      !hasExistingImage &&
      !imageUrlValue
    ) {
      applyUrlPreview(metadata.imageUrl);
      applied.push('image');
    }
    setTimeout(() => {
      applyingPrefill.current = false;
    });

    if (applied.length > 0) {
      enrichedFieldsRef.current = [
        ...new Set([...enrichedFieldsRef.current, ...applied]),
      ];
      setEnrichedFieldsValue(enrichedFieldsRef.current.join(','));
      setShowHint(true);
    }
  }, [
    applyUrlPreview,
    fetcher.data,
    fetcher.state,
    fields.price.name,
    fields.title.name,
    form,
    hasExistingImage,
    hasPendingImageChange,
    imageUrlValue,
    readFieldValue,
  ]);

  return {
    currencyValue,
    enrichedFieldsValue,
    enrichmentEdited,
    isUnfurling: fetcher.state !== 'idle',
    markEdited,
    requestUnfurl,
    showHint,
  };
}

function EditorTrigger({
  DialogTriggerComponent,
  hideFloatingTrigger,
  open,
  setMode,
  showDefaultTrigger,
  trigger,
  wishlistItem,
}: Readonly<{
  DialogTriggerComponent: DialogComponentSet['DialogTriggerComponent'];
  hideFloatingTrigger: boolean;
  open: boolean;
  setMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  showDefaultTrigger: boolean;
  trigger?: React.ReactNode;
  wishlistItem?: EditorProps['wishlistItem'];
}>) {
  if (trigger) {
    return <DialogTriggerComponent asChild>{trigger}</DialogTriggerComponent>;
  }

  if (wishlistItem || !showDefaultTrigger) {
    return null;
  }

  return (
    <>
      <DialogTriggerComponent asChild>
        <Button
          className="hidden sm:inline-flex"
          onClick={() => setMode('create')}
        >
          <Flex gap={1}>
            <LuPlus />
            <Text size="sm">Add Item</Text>
          </Flex>
        </Button>
      </DialogTriggerComponent>
      {!open && !hideFloatingTrigger ? (
        <DialogTriggerComponent asChild>
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
        </DialogTriggerComponent>
      ) : null}
    </>
  );
}

function EditorStatusSection({
  canEdit,
  currentStatus,
  handleStatusChange,
  isDesktop,
  statusError,
  statusPending,
  toggleLabel,
  toggleStatus,
  ToggleIcon,
  wishlistItem,
}: Readonly<{
  canEdit: boolean;
  currentStatus: WishlistItemStatusValue;
  handleStatusChange: (status: WishlistItemStatusValue) => void;
  isDesktop: boolean;
  statusError: string | null;
  statusPending: boolean;
  toggleLabel: string;
  toggleStatus: WishlistItemStatusValue;
  ToggleIcon: typeof LuArchive | typeof LuListChecks;
  wishlistItem?: EditorProps['wishlistItem'];
}>) {
  if (!wishlistItem?.id) {
    return statusError ? (
      <Text size="xs" className="mb-2 text-destructive">
        {statusError}
      </Text>
    ) : null;
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
            {currentStatus === 'ACTIVE' ? 'On wishlist' : 'Past item'}
          </span>
          <div className="flex flex-col">
            <Text size="xs" className="text-muted-foreground">
              Item status
            </Text>
            <Text size="sm" weight="medium">
              {currentStatus === 'ACTIVE' ? 'On wishlist' : 'Past item'}
            </Text>
            <Text size="xs" className="text-muted-foreground">
              {currentStatus === 'ACTIVE'
                ? 'Visible to friends'
                : 'Not shown on your wishlist'}
            </Text>
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size={isDesktop ? 'sm' : 'default'}
              variant={currentStatus === 'ACTIVE' ? 'secondary' : 'default'}
              className="w-full gap-2"
              disabled={statusPending}
              aria-label={toggleLabel}
              onClick={() => handleStatusChange(toggleStatus)}
            >
              <ToggleIcon className="h-4 w-4" aria-hidden />
              <span className="flex-1 text-center">{toggleLabel}</span>
            </Button>
            <Text size="xs" className="text-muted-foreground">
              {currentStatus === 'ACTIVE'
                ? 'This moves the item to Past items. You can restore it anytime.'
                : 'Restoring will add this item back to your wishlist.'}
            </Text>
          </div>
        ) : null}
      </div>
      {statusError ? (
        <Text size="xs" className="mb-2 text-destructive">
          {statusError}
        </Text>
      ) : null}
    </>
  );
}

function EditorViewSection({
  canEdit,
  DialogCloseComponent,
  DialogFooterComponent,
  isDesktop,
  setMode,
  viewExtras,
  wishlistItem,
}: Readonly<{
  canEdit: boolean;
  DialogCloseComponent: DialogComponentSet['DialogCloseComponent'];
  DialogFooterComponent: DialogComponentSet['DialogFooterComponent'];
  isDesktop: boolean;
  setMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  viewExtras?: React.ReactNode;
  wishlistItem?: EditorProps['wishlistItem'];
}>) {
  return (
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
        <dt className="text-xs text-muted-foreground sm:text-sm">Title</dt>
        <dd className="break-words text-base font-medium">
          {wishlistItem?.title ?? '—'}
        </dd>
        <dt className="text-xs text-muted-foreground sm:text-sm">Link</dt>
        <dd className="break-all text-base">
          {wishlistItem?.url ? (
            <a
              href={wishlistItem.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-primary underline decoration-primary/40 underline-offset-4"
            >
              {new URL(wishlistItem.url).hostname}
              <LuExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span>—</span>
          )}
        </dd>
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

      <DialogFooterComponent className="grid gap-3 sm:flex sm:justify-end sm:space-x-2">
        {canEdit && wishlistItem?.id ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMode('edit')}
            className="w-full sm:w-auto"
          >
            Edit item
          </Button>
        ) : null}

        <DialogCloseComponent asChild>
          <Button
            type="button"
            variant="outline"
            className={isDesktop ? 'hidden sm:inline-flex' : 'w-full sm:w-auto'}
          >
            Close
          </Button>
        </DialogCloseComponent>
      </DialogFooterComponent>
    </div>
  );
}

function EnrichmentStatusLine({
  isUnfurling,
  showHint,
}: Readonly<{ isUnfurling: boolean; showHint: boolean }>) {
  if (isUnfurling) {
    return (
      <Text
        size="xs"
        className="flex items-center gap-1.5 text-muted-foreground"
      >
        <LuLoader className="h-3 w-3 animate-spin" aria-hidden />
        Looking up link…
      </Text>
    );
  }
  if (showHint) {
    return (
      <Text size="xs" className="text-muted-foreground">
        Filled from link — edit anything that looks off.
      </Text>
    );
  }
  return null;
}

function EditorFormSection({
  categories,
  DialogCloseComponent,
  DialogFooterComponent,
  fields,
  fileInputRef,
  form,
  formRef,
  handleFileChange,
  handlePasteImage,
  handleRemoveImage,
  imageActionState,
  imageFileInputProps,
  imagePreview,
  imageUrlInputProps,
  imageUrlValue,
  isImageLoading,
  isPending,
  mode,
  prepareImageActionForSave,
  previewSrc,
  previewVersion,
  resetImageChanges,
  saveDisabled,
  setHasPendingImageChange,
  setImageActionState,
  setImageError,
  setImagePreview,
  setImageUrlValue,
  setImageWarning,
  setIsImageLoading,
  setItemType,
  showImageError,
  imageError,
  imageWarning,
  isListLinkType,
  itemType,
  wishlistItem,
  attachClientMutationId,
  applyUrlPreview,
  enrichment,
}: Readonly<{
  applyUrlPreview: (rawValue: string) => void;
  attachClientMutationId: (event: React.FormEvent<HTMLFormElement>) => void;
  categories: { id: string; name: string }[];
  enrichment: EditorEnrichmentController;
  DialogCloseComponent: DialogComponentSet['DialogCloseComponent'];
  DialogFooterComponent: DialogComponentSet['DialogFooterComponent'];
  fields: ReturnType<typeof useForm<z.input<typeof WishlistItemSchema>>>[1];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  form: ReturnType<typeof useForm<z.input<typeof WishlistItemSchema>>>[0];
  formRef: React.RefObject<HTMLFormElement | null>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePasteImage: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  handleRemoveImage: () => void;
  imageActionState: z.infer<typeof ImageActionSchema>;
  imageError: string | null;
  imageFileInputProps: ReturnType<typeof getInputProps>;
  imagePreview: string | null;
  imageUrlInputProps: ReturnType<typeof getInputProps>;
  imageUrlValue: string;
  imageWarning: string | null;
  isImageLoading: boolean;
  isPending: boolean;
  isListLinkType: boolean;
  itemType: WishlistItemType;
  mode: EditorMode;
  prepareImageActionForSave: () => void;
  previewSrc: string | null;
  previewVersion: number;
  resetImageChanges: () => void;
  saveDisabled: boolean;
  setHasPendingImageChange: React.Dispatch<React.SetStateAction<boolean>>;
  setImageActionState: React.Dispatch<
    React.SetStateAction<z.infer<typeof ImageActionSchema>>
  >;
  setImageError: React.Dispatch<React.SetStateAction<string | null>>;
  setImagePreview: React.Dispatch<React.SetStateAction<string | null>>;
  setImageUrlValue: React.Dispatch<React.SetStateAction<string>>;
  setImageWarning: React.Dispatch<React.SetStateAction<string | null>>;
  setIsImageLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setItemType: React.Dispatch<React.SetStateAction<WishlistItemType>>;
  showImageError: boolean;
  wishlistItem?: EditorProps['wishlistItem'];
}>) {
  const { onSubmit: conformOnSubmit, ...conformFormProps } = getFormProps(form);
  const [listLinkSuggestionDismissed, setListLinkSuggestionDismissed] =
    React.useState(false);
  const showListLinkSuggestion =
    !isListLinkType &&
    !listLinkSuggestionDismissed &&
    looksLikeWishlistUrl(fields.url.value ?? '');
  const fieldConfig = getEditorFieldConfig(isListLinkType);
  return (
    <Form
      method="POST"
      {...conformFormProps}
      className="flex flex-col gap-4"
      encType="multipart/form-data"
      ref={formRef as React.RefObject<HTMLFormElement>}
      onSubmit={(event) => {
        conformOnSubmit?.(event);
        if (!event.defaultPrevented) {
          attachClientMutationId(event);
        }
      }}
    >
      <input type="hidden" name="clientMutationId" value="" />
      <input type="hidden" name="type" value={itemType} />
      <input type="hidden" name="currency" value={enrichment.currencyValue} />
      <input
        type="hidden"
        name="enrichedFields"
        value={enrichment.enrichedFieldsValue}
      />
      <input
        type="hidden"
        name="enrichmentEdited"
        value={enrichment.enrichmentEdited ? 'true' : ''}
      />
      {mode === 'create' ? (
        <button
          type="submit"
          name="intent"
          value="save-add-another"
          className="hidden"
        />
      ) : null}
      {wishlistItem?.id ? (
        <input type="hidden" name="id" value={wishlistItem.id} />
      ) : null}
      <EditorTypeSelector
        isListLinkType={isListLinkType}
        resetImageChanges={resetImageChanges}
        setItemType={setItemType}
      />
      {/* Link leads: "paste a link, get a complete item" is the fast path,
          and Title-first framing buried it (June 2026 audit). The autofocused
          link field invites the paste; Title prefills from the unfurl. */}
      <UrlFieldWithSuggestion
        errors={fields.url.errors}
        inputProps={{
          placeholder: fieldConfig.urlPlaceholder,
          autoFocus: true,
          ...getInputProps(fields.url, {
            type: 'url',
            ariaAttributes: true,
          }),
          required: isListLinkType,
          onBlur: (event) => enrichment.requestUnfurl(event.target.value),
          onPaste: (event) => {
            const target = event.currentTarget;
            setTimeout(() => enrichment.requestUnfurl(target.value));
          },
        }}
        labelText={fieldConfig.urlLabel}
        onAcceptSuggestion={() => {
          setItemType('wishlist');
          resetImageChanges();
          setListLinkSuggestionDismissed(true);
        }}
        onDismissSuggestion={() => setListLinkSuggestionDismissed(true)}
        showSuggestion={showListLinkSuggestion}
      />
      <EnrichmentStatusLine
        isUnfurling={enrichment.isUnfurling}
        showHint={enrichment.showHint}
      />
      <Field
        className="w-full"
        labelProps={{ children: fieldConfig.titleLabel }}
        inputProps={{
          placeholder: fieldConfig.titlePlaceholder,
          ...getInputProps(fields.title, {
            type: 'text',
            ariaAttributes: true,
          }),
          onInput: () => enrichment.markEdited('title'),
        }}
        errors={fields.title.errors}
      />
      {isListLinkType ? null : (
        <Field
          className="w-full"
          labelProps={{ children: 'Price (optional)' }}
          inputProps={{
            placeholder: '19.99',
            inputMode: 'decimal',
            ...getInputProps(fields.price, {
              type: 'text',
              ariaAttributes: true,
            }),
            onInput: () => enrichment.markEdited('price'),
          }}
          errors={fields.price.errors}
        />
      )}
      <TextareaField
        className="w-full"
        labelProps={{ children: fieldConfig.noteLabel }}
        textareaProps={{
          placeholder: fieldConfig.notePlaceholder,
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
      <div className={cn('space-y-3', isListLinkType && 'hidden')}>
        <div className="flex items-center justify-between">
          <label
            htmlFor={imageFileInputProps.id}
            className="text-sm font-medium"
          >
            Image
          </label>
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
            ref={fileInputRef as React.RefObject<HTMLInputElement>}
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
              Paste an image URL or paste an image file into this field.
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
        {/* Only meaningful once there's an image (or one was removed) —
            showing it on a pristine empty editor reads as clutter. */}
        {imagePreview || wishlistItem?.hasImage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={resetImageChanges}>
              Reset image changes
            </Button>
          </div>
        ) : null}
      </div>

      <DialogFooterComponent className="grid gap-3 sm:flex sm:justify-end sm:space-x-2">
        <DialogCloseComponent asChild>
          <Button type="button" variant="outline" className="w-full sm:w-auto">
            Cancel
          </Button>
        </DialogCloseComponent>

        <StatusButton
          form={form.id}
          type="submit"
          disabled={saveDisabled}
          status={isPending ? 'pending' : 'idle'}
          variant="default"
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
      </DialogFooterComponent>
    </Form>
  );
}

function resolveInitialMode({
  canEdit,
  hasId,
  initialMode,
}: {
  canEdit: boolean;
  hasId: boolean;
  initialMode: EditorProps['initialMode'];
}): 'view' | 'edit' | 'create' {
  if (initialMode === 'view') return 'view';
  if (initialMode === 'edit') return 'edit';
  if (initialMode === 'create') return 'create';
  if (!hasId) return 'create';
  return canEdit ? 'edit' : 'view';
}

function buildInitialValues({
  defaultCategoryId,
  wishlistItem,
}: {
  defaultCategoryId: string | null;
  wishlistItem: EditorProps['wishlistItem'];
}): EditorInitialValues {
  return {
    title: wishlistItem?.title ?? '',
    url: wishlistItem?.url ?? '',
    note: wishlistItem?.note ?? '',
    price: formatPriceInputValue(wishlistItem?.priceCents),
    categoryId: wishlistItem?.categoryId ?? defaultCategoryId ?? '',
    type: wishlistItem?.type ?? 'text',
    hasImage: wishlistItem?.hasImage ?? false,
    updatedAt: wishlistItem?.updatedAt ?? null,
  };
}

function formatPriceInputValue(priceCents: number | null | undefined) {
  return priceCents == null ? '' : (priceCents / 100).toFixed(2);
}

function getActionSubmissionValue(actionData: WishlistItemEditorActionData) {
  const result = actionData?.result;
  if (result?.status !== 'success' || !('value' in result)) {
    return null;
  }

  return (result as { value: z.infer<typeof WishlistItemSchema> }).value;
}

function useSubmissionImageSync({
  actionData,
  currentImageSrc,
  defaultCategoryId,
  fileInputRef,
  initialValuesRef,
  setHasPendingImageChange,
  setImageActionState,
  setImageError,
  setImageUrlValue,
  setImageWarning,
  setOpen,
  setPreviewVersion,
  shouldResetForm,
  wishlistItem,
}: {
  actionData: WishlistItemEditorActionData;
  currentImageSrc: string | null;
  defaultCategoryId: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  initialValuesRef: React.MutableRefObject<EditorInitialValues>;
  setHasPendingImageChange: React.Dispatch<React.SetStateAction<boolean>>;
  setImageActionState: React.Dispatch<
    React.SetStateAction<z.infer<typeof ImageActionSchema>>
  >;
  setImageError: React.Dispatch<React.SetStateAction<string | null>>;
  setImageUrlValue: React.Dispatch<React.SetStateAction<string>>;
  setImageWarning: React.Dispatch<React.SetStateAction<string | null>>;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewVersion: React.Dispatch<React.SetStateAction<number>>;
  shouldResetForm: boolean;
  wishlistItem: EditorProps['wishlistItem'];
}) {
  useEffect(() => {
    if (actionData?.imageError) {
      setImageError(actionData.imageError);
      if (actionData.imageAction === 'none' && !currentImageSrc) {
        setImageWarning(actionData.imageError);
      }
    }

    if (actionData?.result?.status !== 'success') return;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setHasPendingImageChange(false);
    setImageActionState('none');
    setImageWarning(null);
    setImageError(null);
    setImageUrlValue('');
    setPreviewVersion((value) => value + 1);

    const nextValue = getActionSubmissionValue(actionData);
    initialValuesRef.current = shouldResetForm
      ? {
          title: '',
          url: '',
          note: '',
          price: '',
          categoryId:
            nextValue?.categoryId ??
            initialValuesRef.current.categoryId ??
            defaultCategoryId ??
            '',
          type: nextValue?.type ?? initialValuesRef.current.type,
          hasImage: false,
          updatedAt: null,
        }
      : {
          title: nextValue?.title ?? initialValuesRef.current.title,
          url: nextValue?.url ?? initialValuesRef.current.url,
          note: nextValue?.note ?? initialValuesRef.current.note,
          price:
            nextValue?.price == null
              ? initialValuesRef.current.price
              : formatPriceInputValue(nextValue.price),
          categoryId:
            nextValue?.categoryId ?? initialValuesRef.current.categoryId,
          type: nextValue?.type ?? initialValuesRef.current.type,
          hasImage:
            (nextValue as { hasImage?: boolean } | null)?.hasImage ??
            wishlistItem?.hasImage ??
            initialValuesRef.current.hasImage,
          updatedAt:
            wishlistItem?.updatedAt ?? initialValuesRef.current.updatedAt,
        };

    if (actionData.intent === 'save') {
      setOpen(false);
    }
  }, [
    actionData,
    currentImageSrc,
    defaultCategoryId,
    fileInputRef,
    initialValuesRef,
    setHasPendingImageChange,
    setImageActionState,
    setImageError,
    setImageUrlValue,
    setImageWarning,
    setOpen,
    setPreviewVersion,
    shouldResetForm,
    wishlistItem?.hasImage,
    wishlistItem?.updatedAt,
  ]);
}

export type WishlistItemEditorHandle = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  openView: (options?: { fromTrigger?: boolean }) => void;
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
      showDefaultTrigger = true,
      hideFloatingTrigger = false,
      onStatusChange,
    },
    ref,
  ) => {
    const { hasId, mode, open, setMode, setOpen } = useWishlistItemEditorMode(
      {
        canEdit,
        initialMode,
        wishlistItem,
      },
      ref,
    );
    const {
      currentStatus,
      handleStatusChange,
      statusError,
      statusPending,
      toggleLabel,
      toggleStatus,
      ToggleIcon,
    } = useWishlistItemStatusController({
      onStatusChange,
      wishlistItem,
    });
    const actionData = useActionData<
      typeof action
    >() as WishlistItemEditorActionData;
    const requestInfo = useOptionalRequestInfo();
    const trackedAnalyticsEventIdRef = useRef<string | null>(null);
    const requestIdFallback = requestInfo?.requestId ?? null;
    const isPending = useIsPending();
    const formRef = useRef<HTMLFormElement>(null);
    const attachClientMutationId = useCallback(
      (event: React.FormEvent<HTMLFormElement>) => {
        const formElement = event.currentTarget;
        const existing = formElement.elements.namedItem(
          'clientMutationId',
        ) as HTMLInputElement | null;
        const mutationId = createClientMutationId();
        if (existing) {
          existing.value = mutationId;
          return;
        }

        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'clientMutationId';
        hiddenInput.value = mutationId;
        formElement.append(hiddenInput);
      },
      [],
    );
    const imageController = useWishlistItemEditorImageState({
      actionData,
      defaultCategoryId,
      formRef,
      setOpen,
      wishlistItem,
    });

    useToast(actionData?.toast);
    const actionStatus = actionData?.result?.status;
    const analyticsEventId = actionData?.analyticsEventId ?? null;
    const analyticsRequestId = actionData?.requestId;
    useEffect(() => {
      if (!analyticsEventId) return;
      if (actionStatus !== 'success') return;
      if (trackedAnalyticsEventIdRef.current === analyticsEventId) return;
      trackedAnalyticsEventIdRef.current = analyticsEventId;
      track('wishlist_item_added', undefined, {
        eventId: analyticsEventId,
        requestId: analyticsRequestId ?? requestIdFallback,
      });
    }, [analyticsEventId, analyticsRequestId, actionStatus, requestIdFallback]);

    const formId = React.useId();
    const isDesktop = useIsDesktop();
    const [itemType, setItemType] = React.useState<WishlistItemType>(
      (wishlistItem?.type as WishlistItemType | undefined) ?? 'text',
    );
    const isListLinkType = itemType === 'wishlist';
    const [form, fields] = useForm<z.input<typeof WishlistItemSchema>>({
      id: formId,
      constraint: getZodConstraint(WishlistItemSchema),
      lastResult: imageController.shouldResetForm
        ? undefined
        : (actionData?.result as any),
      onValidate({ formData }) {
        return parseWithZod(formData, { schema: WishlistItemSchema }) as any;
      },
      defaultValue: {
        title: wishlistItem?.title ?? '',
        url: wishlistItem?.url ?? '',
        note: wishlistItem?.note ?? '',
        price: formatPriceInputValue(wishlistItem?.priceCents),
        categoryId: wishlistItem?.categoryId ?? defaultCategoryId ?? '',
        imageAction: 'none',
        imageUrl: '',
      },
    });

    const enrichment = useUrlEnrichment({
      fields,
      form,
      formRef,
      imageController,
      isListLinkType,
      wishlistItem,
    });

    const {
      DialogRoot,
      DialogTriggerComponent,
      DialogContentComponent,
      DialogHeaderComponent,
      DialogFooterComponent,
      DialogTitleComponent,
      DialogDescriptionComponent,
      DialogCloseComponent,
    } = getEditorDialogComponents(isDesktop);

    const imageFileInputProps = getInputProps(fields.imageFile, {
      type: 'file',
      ariaAttributes: true,
    });
    const imageUrlInputProps = getInputProps(fields.imageUrl, {
      type: 'url',
      ariaAttributes: true,
    });
    const titleText = getEditorTitle(mode, hasId, wishlistItem);
    const initialValues = buildInitialValues({
      defaultCategoryId,
      wishlistItem,
    });
    const hasFieldChanges =
      normalizeEditorFieldValue(
        fields.title.value ?? fields.title.defaultValue ?? '',
      ) !== normalizeEditorFieldValue(initialValues.title) ||
      normalizeEditorFieldValue(
        fields.url.value ?? fields.url.defaultValue ?? '',
      ) !== normalizeEditorFieldValue(initialValues.url) ||
      normalizeEditorFieldValue(
        fields.note.value ?? fields.note.defaultValue ?? '',
      ) !== normalizeEditorFieldValue(initialValues.note) ||
      normalizeEditorFieldValue(
        (fields.price.value ?? fields.price.defaultValue ?? '') as string,
      ) !== normalizeEditorFieldValue(initialValues.price) ||
      normalizeEditorFieldValue(
        (fields.categoryId.value ??
          fields.categoryId.defaultValue ??
          '') as string,
      ) !== normalizeEditorFieldValue(initialValues.categoryId) ||
      itemType !== normalizeEditorFieldValue(initialValues.type);
    const hasImageChanges =
      imageController.hasPendingImageChange ||
      imageController.imageActionState === 'remove' ||
      imageController.imageActionState === 'url';
    const saveDisabled =
      isPending || !(form.dirty || hasFieldChanges || hasImageChanges);

    return (
      <DialogRoot open={open} onOpenChange={setOpen}>
        <EditorTrigger
          DialogTriggerComponent={DialogTriggerComponent}
          hideFloatingTrigger={hideFloatingTrigger}
          open={open}
          setMode={setMode}
          showDefaultTrigger={showDefaultTrigger}
          trigger={trigger}
          wishlistItem={wishlistItem}
        />
        <DialogContentComponent
          className="p-5 sm:max-w-[36rem] sm:p-6"
          {...(!isDesktop ? { showHandle: true } : {})}
        >
          <DialogHeaderComponent>
            <div>
              <DialogDescriptionComponent className="mb-1 text-xs text-muted-foreground">
                Wishlist item
              </DialogDescriptionComponent>
              <DialogTitleComponent>{titleText}</DialogTitleComponent>
            </div>
            <DialogDescriptionComponent className="sr-only">
              Update wishlist item details
            </DialogDescriptionComponent>
          </DialogHeaderComponent>
          <div className="mx-auto w-full sm:w-[28rem]">
            <EditorStatusSection
              canEdit={canEdit}
              currentStatus={currentStatus}
              handleStatusChange={handleStatusChange}
              isDesktop={isDesktop}
              statusError={statusError}
              statusPending={statusPending}
              toggleLabel={toggleLabel}
              toggleStatus={toggleStatus}
              ToggleIcon={ToggleIcon}
              wishlistItem={wishlistItem}
            />
            {mode === 'view' ? (
              <EditorViewSection
                canEdit={canEdit}
                DialogCloseComponent={DialogCloseComponent}
                DialogFooterComponent={DialogFooterComponent}
                isDesktop={isDesktop}
                setMode={setMode}
                viewExtras={viewExtras}
                wishlistItem={wishlistItem}
              />
            ) : (
              <EditorFormSection
                applyUrlPreview={imageController.applyUrlPreview}
                attachClientMutationId={attachClientMutationId}
                categories={categories}
                enrichment={enrichment}
                DialogCloseComponent={DialogCloseComponent}
                DialogFooterComponent={DialogFooterComponent}
                fields={fields}
                fileInputRef={imageController.fileInputRef}
                form={form}
                formRef={formRef}
                handleFileChange={imageController.handleFileChange}
                handlePasteImage={imageController.handlePasteImage}
                handleRemoveImage={imageController.handleRemoveImage}
                imageActionState={imageController.imageActionState}
                imageError={imageController.imageError}
                imageFileInputProps={imageFileInputProps}
                imagePreview={imageController.imagePreview}
                imageUrlInputProps={imageUrlInputProps}
                imageUrlValue={imageController.imageUrlValue}
                imageWarning={imageController.imageWarning}
                isImageLoading={imageController.isImageLoading}
                isPending={isPending}
                isListLinkType={isListLinkType}
                itemType={itemType}
                mode={mode}
                prepareImageActionForSave={
                  imageController.prepareImageActionForSave
                }
                previewSrc={imageController.previewSrc}
                previewVersion={imageController.previewVersion}
                resetImageChanges={imageController.resetImageChanges}
                saveDisabled={saveDisabled}
                setHasPendingImageChange={
                  imageController.setHasPendingImageChange
                }
                setImageActionState={imageController.setImageActionState}
                setImageError={imageController.setImageError}
                setImagePreview={imageController.setImagePreview}
                setImageUrlValue={imageController.setImageUrlValue}
                setImageWarning={imageController.setImageWarning}
                setIsImageLoading={imageController.setIsImageLoading}
                setItemType={setItemType}
                showImageError={imageController.showImageError}
                wishlistItem={wishlistItem}
              />
            )}
          </div>
        </DialogContentComponent>
      </DialogRoot>
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
