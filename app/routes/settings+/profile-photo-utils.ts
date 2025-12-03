import { useCallback, useEffect, useRef, useState } from 'react';
import { type Area } from 'react-easy-crop';

const normalizeImageType = (type: string) =>
  type === 'image/png' ? 'image/png' : 'image/jpeg';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.src = src;

    image.onload = () => resolve(image);
    image.onerror = reject;
  });

export const createCroppedFile = async ({
  src,
  area,
  imageType,
  maxSize,
}: {
  src: string;
  area: Area;
  imageType: string;
  maxSize: number;
}) => {
  try {
    const image = await loadImage(src);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      return { file: null, error: 'Unable to prepare the image editor.' };
    }

    const width = Math.round(area.width);
    const height = Math.round(area.height);

    canvas.width = width;
    canvas.height = height;

    context.drawImage(
      image,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      width,
      height,
    );

    const preferredType = normalizeImageType(imageType);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), preferredType, 0.92),
    );

    if (!blob) {
      return {
        file: null,
        error: 'There was a problem processing the image. Please try again.',
      };
    }

    if (blob.size > maxSize) {
      return {
        file: null,
        error: 'Cropped image must be less than 3MB. Try zooming in further.',
      };
    }

    return {
      file: new File(
        [blob],
        `profile-photo.${preferredType === 'image/png' ? 'png' : 'jpg'}`,
        {
          type: preferredType,
        },
      ),
      error: null,
    };
  } catch (error) {
    console.error(error);
    return {
      file: null,
      error: 'We could not edit this image. Please try another one.',
    };
  }
};

export const useObjectUrl = () => {
  const [url, setUrl] = useState<string | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const revokeUrl = useCallback(() => {
    if (previousUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(previousUrlRef.current);
    }
    previousUrlRef.current = null;
  }, []);

  const updateUrl = useCallback(
    (nextUrl: string | null) => {
      revokeUrl();
      previousUrlRef.current = nextUrl;
      setUrl(nextUrl);
    },
    [revokeUrl],
  );

  useEffect(() => revokeUrl, [revokeUrl]);

  return { url, setUrl: updateUrl };
};
