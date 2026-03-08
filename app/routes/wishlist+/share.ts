import { invariantResponse } from '@epic-web/invariant';
import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getDomainUrl } from '#app/utils/misc.tsx';
import {
  getActiveWishlistPublicShare,
  revokeWishlistPublicShare,
  upsertWishlistPublicShare,
} from '#app/utils/wishlist.server.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    select: {
      username: true,
    },
    where: {
      id: userId,
    },
  });
  invariantResponse(user, 'User not found', {
    status: 404,
  });
  const share = await getActiveWishlistPublicShare(userId);
  return {
    username: user.username,
    origin: getDomainUrl(request),
    publicShare: share
      ? {
          token: share.token,
          createdAt: share.createdAt.toISOString(),
        }
      : null,
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  switch (intent) {
    case 'generate-public-link': {
      const existingShare = await getActiveWishlistPublicShare(userId);
      if (existingShare) {
        return {
          publicShare: {
            token: existingShare.token,
            createdAt: existingShare.createdAt.toISOString(),
          },
          toast: {
            title: 'Public link already active',
            description: 'Copy and share this view-only link.',
            type: 'message' as const,
          },
        };
      }
      const { share, token } = await upsertWishlistPublicShare(userId);
      return {
        publicShare: {
          token,
          createdAt: share.createdAt.toISOString(),
        },
        toast: {
          title: 'Public link created',
          description: 'Copy and share with anyone. No login required.',
          type: 'success' as const,
        },
      };
    }
    case 'revoke-public-link': {
      await revokeWishlistPublicShare(userId);
      return {
        publicShare: null,
        toast: {
          title: 'Public link revoked',
          description: 'Previous public links are now disabled.',
          type: 'success' as const,
        },
      };
    }
    default:
      return data(
        {
          error: 'Invalid intent',
        },
        {
          status: 400,
        },
      );
  }
}
