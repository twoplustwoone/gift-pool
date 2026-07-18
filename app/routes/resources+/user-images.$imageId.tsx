import { invariantResponse } from '@epic-web/invariant';
import sharp from 'sharp';
import { type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { USER_IMAGE_SIZES } from '#app/utils/misc.tsx';

const ALLOWED_IMAGE_SIZES = new Set<number>(USER_IMAGE_SIZES);

// New uploads are always re-encoded to webp, but legacy rows may carry an
// arbitrary stored contentType. Only serve a known-inert raster type as-is;
// anything else (e.g. a legacy image/svg+xml or text/html row) is downgraded
// so it can never render as an active, same-origin document.
const SAFE_RASTER_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

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
  await requireUserId(request);
  invariantResponse(params.imageId, 'Image ID is required', { status: 400 });
  const requestedSize = parseRequestedSize(request);

  const image = await prisma.userImage.findUnique({
    where: { id: params.imageId },
    select: { contentType: true, blob: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  if (!requestedSize) {
    const body = new Uint8Array(image.blob).buffer;
    const safeContentType = SAFE_RASTER_CONTENT_TYPES.has(image.contentType)
      ? image.contentType
      : 'application/octet-stream';

    return new Response(body, {
      headers: {
        'Content-Type': safeContentType,
        'Content-Length': String(image.blob.byteLength),
        // Force download rather than inline render, and pin an enforced,
        // maximally-restrictive CSP on this response specifically (the global
        // app CSP is report-only). Together with nosniff this prevents a
        // stored SVG/HTML blob from executing as a same-origin document.
        'Content-Disposition': `attachment; filename="${params.imageId}"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=31536000, immutable',
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
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
