import { parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import {
  data,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { processImageFromFile } from '#app/utils/wishlist-images.server.ts';

// Action-only resource route. The photo editor UI lives inline in the
// settings hub as `ProfilePhotoSheet`; the sheet's fetcher POSTs here to
// upload a cropped image or delete the current one. GET requests just bounce
// back to the hub so old /settings/profile/photo bookmarks don't 404.

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

const MAX_SIZE = 1024 * 1024 * 3; // 3MB

// Raster types only. SVG and HTML are deliberately excluded: they can carry
// active content, and every stored upload is additionally re-encoded to webp
// via `processImageFromFile` so the persisted bytes are never a live document.
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

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
    )
    .refine(
      (file) => ALLOWED_UPLOAD_CONTENT_TYPES.has(file.type),
      'Unsupported image type. Use PNG, JPEG, WebP, or GIF.',
    ),
});
const PhotoFormSchema = z.discriminatedUnion('intent', [
  DeleteImageSchema,
  NewImageSchema,
]);

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return redirect('/settings/profile');
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = await parseWithZod(formData, {
    schema: PhotoFormSchema,
    async: true,
  });
  if (submission.status !== 'success') {
    return data(
      { result: submission.reply() },
      { status: submission.status === 'error' ? 400 : 200 },
    );
  }
  if (submission.value.intent === 'delete') {
    await prisma.userImage.deleteMany({ where: { userId } });
    return redirect('/settings/profile');
  }

  // Re-encode to a fixed raster format so a crafted upload (e.g. an SVG or
  // HTML disguised with an image MIME) can never be persisted as active,
  // same-origin-executable content. `processImageFromFile` returns webp bytes
  // and a server-derived `contentType` — we never trust the client's MIME.
  let processed;
  try {
    processed = await processImageFromFile(submission.value.photoFile);
  } catch {
    return data(
      {
        result: submission.reply({
          formErrors: ['Could not process image. Please try a different file.'],
        }),
      },
      { status: 400 },
    );
  }
  invariantResponse(processed, 'Image is required');
  await prisma.$transaction([
    prisma.userImage.deleteMany({ where: { userId } }),
    prisma.userImage.create({
      data: {
        userId,
        contentType: processed.contentType,
        blob: processed.data,
      },
    }),
  ]);
  return redirect('/settings/profile');
}
