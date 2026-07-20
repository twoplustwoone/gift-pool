import {
  type ChangeEvent,
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Area } from 'react-easy-crop';
import { useFetcher } from 'react-router';
import { Button, buttonVariants } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import {
  ResponsiveDialog as MobileBottomSheet,
  ResponsiveDialogContent as MobileBottomSheetContent,
  ResponsiveDialogDescription as MobileBottomSheetDescription,
  ResponsiveDialogFooter as MobileBottomSheetFooter,
  ResponsiveDialogHeader as MobileBottomSheetHeader,
  ResponsiveDialogTitle as MobileBottomSheetTitle,
} from '#app/components/ui/responsive-dialog.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { cn, getUserImgSrc, useDoubleCheck } from '#app/utils/misc.tsx';
import {
  createCroppedFile,
  useObjectUrl,
} from './profile-photo-utils.ts';

// react-easy-crop touches `window` at module load, which crashes SSR when it's
// pulled in via the settings hub bundle. Lazy-load so it only hits the client.
const Cropper = lazy(() => import('react-easy-crop'));

const MAX_SIZE = 1024 * 1024 * 3; // 3MB

type ProfilePhotoSheetProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentImageId: string | null;
  userName: string | null;
  userUsername: string;
}>;

// Inline replacement for the old /settings/profile/photo page. File picker +
// react-easy-crop preview live in a MobileBottomSheet opened from the avatar
// in the Profile card. Submits via fetcher to the existing action-only route
// so the hub revalidates and the new avatar shows up automatically.
//
// Intentionally NOT wrapped in a form — a fetcher.Form wrapping the file
// input caused the dialog to unmount on file-change in tests (conform's
// onInput revalidation appears to race with Radix's focus management). We
// build FormData by hand in `handleSave` instead.
export function ProfilePhotoSheet({
  open,
  onOpenChange,
  currentImageId,
  userName,
  userUsername,
}: ProfilePhotoSheetProps) {
  const fetcher = useFetcher();
  const doubleCheckDeleteImage = useDoubleCheck();

  const { url: selectedImageSrc, setUrl: setSelectedImageSrc } = useObjectUrl();
  const [selectedImageType, setSelectedImageType] = useState('image/jpeg');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSaving =
    fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'submit';
  const isDeleting =
    fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'delete';

  const displayedImage = useMemo(
    () => selectedImageSrc ?? getUserImgSrc(currentImageId),
    [currentImageId, selectedImageSrc],
  );

  const resetSelection = () => {
    setSelectedImageSrc(null);
    setSelectedImageType('image/jpeg');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setLocalError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetSelection();
    onOpenChange(next);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setSelectedImageSrc(objectUrl);
    setSelectedImageType(file.type || 'image/jpeg');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setLocalError(null);
  };

  const handleSave = async () => {
    if (!selectedImageSrc || !croppedArea) {
      setLocalError('Select an image and adjust the crop before saving.');
      return;
    }
    const { file, error } = await createCroppedFile({
      src: selectedImageSrc,
      area: croppedArea,
      imageType: selectedImageType,
      maxSize: MAX_SIZE,
    });
    if (error || !file) {
      setLocalError(error ?? 'Could not process the image.');
      return;
    }
    const formData = new FormData();
    formData.set('intent', 'submit');
    formData.set('photoFile', file);
    void fetcher.submit(formData, {
      method: 'POST',
      action: '/settings/profile/photo',
      encType: 'multipart/form-data',
    });
    onOpenChange(false);
    resetSelection();
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.set('intent', 'delete');
    void fetcher.submit(formData, {
      method: 'POST',
      action: '/settings/profile/photo',
    });
    onOpenChange(false);
    resetSelection();
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={handleOpenChange}>
      <MobileBottomSheetContent className="max-h-[90vh]">
        <MobileBottomSheetHeader>
          <MobileBottomSheetTitle>Profile photo</MobileBottomSheetTitle>
          <MobileBottomSheetDescription>
            Upload a clear, centered photo. Crop, pan, and zoom so it looks
            just right.
          </MobileBottomSheetDescription>
        </MobileBottomSheetHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="relative h-48 w-48 overflow-hidden rounded-full border border-dashed border-muted-foreground/50 bg-muted">
            {selectedImageSrc ? (
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    Loading editor…
                  </div>
                }
              >
                <Cropper
                  image={selectedImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  showGrid={false}
                  cropShape="round"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedAreaPixels: Area) =>
                    setCroppedArea(croppedAreaPixels)
                  }
                />
              </Suspense>
            ) : (
              <img
                src={displayedImage}
                alt={userName ?? userUsername}
                className="h-full w-full object-cover"
              />
            )}
          </div>

          {selectedImageSrc ? (
            <div className="flex w-full max-w-xs flex-col gap-2">
              <label
                htmlFor="profile-photo-zoom"
                className="text-xs font-medium text-foreground"
              >
                Zoom
              </label>
              <div className="flex items-center gap-3">
                <Icon
                  aria-hidden
                  name="arrow-left"
                  className="h-4 w-4 text-muted-foreground"
                />
                <input
                  id="profile-photo-zoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-full accent-foreground"
                  aria-label="Adjust zoom"
                />
                <Icon
                  aria-hidden
                  name="arrow-right"
                  className="h-4 w-4 text-muted-foreground"
                />
              </div>
            </div>
          ) : null}

          <div className="relative">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              aria-label="Change photo"
              className={cn(
                buttonVariants({ size: 'sm' }),
                'absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full border border-input bg-primary text-primary-foreground opacity-0',
              )}
              onChange={handleFileChange}
            />
            <span
              aria-hidden
              className={cn(
                buttonVariants({ size: 'sm' }),
                'pointer-events-none gap-2 bg-primary text-primary-foreground',
              )}
            >
              <Icon aria-hidden name="camera" className="h-4 w-4" />
              {selectedImageSrc ? 'Pick another' : 'Choose photo'}
            </span>
          </div>

          {localError ? (
            <p className="text-center text-xs text-destructive">{localError}</p>
          ) : null}
        </div>

        <MobileBottomSheetFooter className="mt-2 flex-col gap-2 sm:flex-row sm:justify-between">
          {currentImageId ? (
            <StatusButton
              variant="destructive"
              status={isDeleting ? 'pending' : 'idle'}
              type="button"
              {...doubleCheckDeleteImage.getButtonProps({
                onClick: () => {
                  if (doubleCheckDeleteImage.doubleCheck) {
                    handleDelete();
                  }
                },
              })}
            >
              <Icon name="trash">
                {doubleCheckDeleteImage.doubleCheck
                  ? 'Are you sure?'
                  : 'Remove photo'}
              </Icon>
            </StatusButton>
          ) : (
            <span />
          )}

          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline"
              type="button"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <StatusButton
              type="button"
              onClick={handleSave}
              status={isSaving ? 'pending' : 'idle'}
              disabled={!selectedImageSrc}
            >
              Save photo
            </StatusButton>
          </div>
        </MobileBottomSheetFooter>
      </MobileBottomSheetContent>
    </MobileBottomSheet>
  );
}
