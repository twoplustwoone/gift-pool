import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import {
  json,
  redirect,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from '@remix-run/node';
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from '@remix-run/react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { z } from 'zod';
import { ErrorList } from '#app/components/forms.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  getUserImgSrc,
  useDoubleCheck,
} from '#app/utils/misc.tsx';
import { type BreadcrumbHandle } from './profile.tsx';

export const handle: BreadcrumbHandle & SEOHandle = {
  breadcrumb: <Icon name="avatar">Photo</Icon>,
  getSitemapEntries: () => null,
};

const MAX_SIZE = 1024 * 1024 * 3; // 3MB

const DeleteImageSchema = z.object({
  intent: z.literal('delete'),
});

const NewImageSchema = z.object({
  intent: z.literal('submit'),
  photoFile: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'Image is required')
    .refine(
      (file) => file.size <= MAX_SIZE,
      'Image size must be less than 3MB',
    ),
});

const PhotoFormSchema = z.discriminatedUnion('intent', [
  DeleteImageSchema,
  NewImageSchema,
]);

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      image: { select: { id: true } },
    },
  });
  invariantResponse(user, 'User not found', { status: 404 });
  return json({ user });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await unstable_parseMultipartFormData(
    request,
    unstable_createMemoryUploadHandler({ maxPartSize: MAX_SIZE }),
  );

  const submission = await parseWithZod(formData, {
    schema: PhotoFormSchema.transform(async (data) => {
      if (data.intent === 'delete') return { intent: 'delete' };
      if (data.photoFile.size <= 0) return z.NEVER;
      return {
        intent: data.intent,
        image: {
          contentType: data.photoFile.type,
          blob: Buffer.from(await data.photoFile.arrayBuffer()),
        },
      };
    }),
    async: true,
  });

  if (submission.status !== 'success') {
    return json(
      { result: submission.reply() },
      { status: submission.status === 'error' ? 400 : 200 },
    );
  }

  const { image, intent } = submission.value;

  if (intent === 'delete') {
    await prisma.userImage.deleteMany({ where: { userId } });
    return redirect('/settings/profile');
  }

  invariantResponse(image, 'Image is required');

  await prisma.$transaction([
    prisma.userImage.deleteMany({ where: { userId } }),
    prisma.userImage.create({
      data: {
        userId,
        contentType: image.contentType,
        blob: image.blob,
      },
    }),
  ]);

  return redirect('/settings/profile');
}

const PhotoRoute = () => {
  const data = useLoaderData<typeof loader>();
  const doubleCheckDeleteImage = useDoubleCheck();

  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const [form, fields] = useForm<z.input<typeof PhotoFormSchema>>({
    id: 'profile-photo',
    constraint: getZodConstraint(PhotoFormSchema),
    lastResult: actionData?.result as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: PhotoFormSchema }) as any;
    },
  });

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [selectedImageType, setSelectedImageType] = useState('image/jpeg');

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSaving =
    navigation.state !== 'idle' && navigation.formData?.get('intent') === 'submit';
  const isDeleting =
    navigation.state !== 'idle' && navigation.formData?.get('intent') === 'delete';

  useEffect(() => {
    return () => {
      if (selectedImageSrc?.startsWith('blob:')) URL.revokeObjectURL(selectedImageSrc);
    };
  }, [selectedImageSrc]);

  const currentImage = useMemo(
    () => selectedImageSrc ?? getUserImgSrc(data.user.image?.id),
    [data.user.image?.id, selectedImageSrc],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setSelectedImageSrc(objectUrl);
    setSelectedImageType(file.type || 'image/jpeg');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setLocalError(null);
    setDialogOpen(true);
  };

  const handleDialogToggle = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setLocalError(null);
    }
  };

  const createCroppedFile = async () => {
    if (!selectedImageSrc || !croppedArea) {
      setLocalError('Select an image and adjust the crop before saving.');
      return null;
    }

    try {
      const image = new Image();
      image.src = selectedImageSrc;

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        setLocalError('Unable to prepare the image editor.');
        return null;
      }

      const width = Math.round(croppedArea.width);
      const height = Math.round(croppedArea.height);

      canvas.width = width;
      canvas.height = height;

      context.drawImage(
        image,
        croppedArea.x,
        croppedArea.y,
        croppedArea.width,
        croppedArea.height,
        0,
        0,
        width,
        height,
      );

      const preferredType = selectedImageType === 'image/png' ? 'image/png' : 'image/jpeg';

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((value) => resolve(value), preferredType, 0.92),
      );

      if (!blob) {
        setLocalError('There was a problem processing the image. Please try again.');
        return null;
      }

      if (blob.size > MAX_SIZE) {
        setLocalError('Cropped image must be less than 3MB. Try zooming in further.');
        return null;
      }

      return new File(
        [blob],
        `profile-photo.${preferredType === 'image/png' ? 'png' : 'jpg'}`,
        {
          type: preferredType,
        },
      );
    } catch (error) {
      console.error(error);
      setLocalError('We could not edit this image. Please try another one.');
      return null;
    }
  };

  const handleSave = async () => {
    if (!formRef.current || !fileInputRef.current) return;
    const croppedFile = await createCroppedFile();
    if (!croppedFile) return;

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(croppedFile);
    fileInputRef.current.files = dataTransfer.files;

    formRef.current.requestSubmit();
    setDialogOpen(false);
  };

  const fieldErrors = fields.photoFile.errors ?? [];
  const formErrors = form.errors ?? [];
  const combinedErrors = [localError, ...fieldErrors, ...formErrors].filter(Boolean);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Form
        ref={formRef}
        method="POST"
        encType="multipart/form-data"
        {...getFormProps(form)}
        className="flex flex-col items-center gap-6 text-center"
      >
        <input {...getInputProps(fields.intent, { type: 'hidden' })} value="submit" />
        <button type="submit" className="sr-only" aria-hidden />
        <div className="relative h-52 w-52 overflow-hidden rounded-full border border-dashed border-muted-foreground/50">
          <img
            src={currentImage}
            alt={data.user?.name ?? data.user?.username}
            className="h-full w-full object-cover"
          />
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Upload a clear, centered photo. You can crop, pan, and zoom before saving so your
          profile picture looks just right.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={() => fileInputRef.current?.click()}
            aria-describedby={fields.photoFile.id}
          >
            <Icon name="camera">Change photo</Icon>
          </Button>
        </div>
        <input
          {...getInputProps(fields.photoFile, { type: 'file' })}
          accept="image/*"
          ref={fileInputRef}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChange}
        />
        <ErrorList errors={combinedErrors} id={fields.photoFile.id} />
      </Form>

      {data.user.image?.id ? (
        <Form method="POST" className="flex justify-center">
          <input type="hidden" name="intent" value="delete" />
          <StatusButton
            variant="destructive"
            status={isDeleting ? 'pending' : 'idle'}
            type="submit"
            {...doubleCheckDeleteImage.getButtonProps()}
          >
            <Icon name="trash">
              {doubleCheckDeleteImage.doubleCheck ? 'Are you sure?' : 'Remove photo'}
            </Icon>
          </StatusButton>
        </Form>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={handleDialogToggle}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adjust your new photo</DialogTitle>
            <DialogDescription>
              Fine-tune the crop so your profile picture stays centered and clear across all
              devices.
            </DialogDescription>
          </DialogHeader>

          <div className="relative h-80 w-full overflow-hidden rounded-lg bg-muted">
            {selectedImageSrc ? (
              <Cropper
                image={selectedImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedAreaPixels) => setCroppedArea(croppedAreaPixels)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Choose an image to start editing.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="zoom" className="text-sm font-medium text-foreground">
              Zoom
            </label>
            <div className="flex items-center gap-3">
              <Icon
                aria-hidden
                name="arrow-left"
                className="h-4 w-4 text-muted-foreground"
              />
              <input
                id="zoom"
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

          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => handleDialogToggle(false)}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhotoRoute;
