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

// Action-only resource route. The photo editor UI lives inline in the
// settings hub as `ProfilePhotoSheet`; the sheet's fetcher POSTs here to
// upload a cropped image or delete the current one. GET requests just bounce
// back to the hub so old /settings/profile/photo bookmarks don't 404.

export const handle: SEOHandle = {
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
  await requireUserId(request);
  return redirect('/settings/profile');
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = await parseWithZod(formData, {
    schema: PhotoFormSchema.transform(async (value) => {
      if (value.intent === 'delete') return { intent: 'delete' as const };
      if (value.photoFile.size <= 0) return z.NEVER;
      return {
        intent: value.intent,
        image: {
          contentType: value.photoFile.type,
          blob: Buffer.from(await value.photoFile.arrayBuffer()),
        },
      };
    }),
    async: true,
  });
  if (submission.status !== 'success') {
    return data(
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
