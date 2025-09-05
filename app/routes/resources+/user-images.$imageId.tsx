import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from '@remix-run/node';
import { prisma } from '#app/utils/db.server.ts';

export async function loader({ params }: LoaderFunctionArgs) {
  invariantResponse(params.imageId, 'Image ID is required', { status: 400 });
  const image = await prisma.userImage.findUnique({
    where: { id: params.imageId },
    select: { contentType: true, blob: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  const body = new Uint8Array(image.blob).buffer;

  return new Response(body, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.blob.byteLength),
      'Content-Disposition': `inline; filename="${params.imageId}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
