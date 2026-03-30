import { invariantResponse } from '@epic-web/invariant';
import sharp from 'sharp';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '#app/utils/db.server.ts';

const ALLOWED_IMAGE_SIZES = new Set([32, 48, 64, 96, 128, 256, 512]);

function parseRequestedSize(request: Request) {
  const sizeParam = new URL(request.url).searchParams.get('size');
  if (!sizeParam) return null;

  const size = Number(sizeParam);
  invariantResponse(Number.isInteger(size), 'Invalid image size', {
    status: 400,
  });
  invariantResponse(ALLOWED_IMAGE_SIZES.has(size), 'Unsupported image size', {
    status: 400,
  });

  return size;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  invariantResponse(params.imageId, 'Image ID is required', { status: 400 });
  const requestedSize = parseRequestedSize(request);

  const image = await prisma.userImage.findUnique({
    where: { id: params.imageId },
    select: { contentType: true, blob: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  if (!requestedSize) {
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

  const resizedImage = await sharp(image.blob)
    .resize(requestedSize, requestedSize, {
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();

  return new Response(new Uint8Array(resizedImage).buffer, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(resizedImage.byteLength),
      'Content-Disposition': `inline; filename="${params.imageId}-${requestedSize}.webp"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
