import { type ComponentProps } from 'react';
import { Link } from 'react-router';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { useTranslation } from '#app/utils/i18n.tsx';
import { FriendActionButton } from './friend-action-button.tsx';

type FriendRelationship = ComponentProps<
  typeof FriendActionButton
>['relationship'];

type GateContext = 'profile' | 'wishlist';

type FriendGateCardProps = {
  targetUserId: string;
  targetUserName: string;
  targetUser?: {
    image: { id: string } | null;
    name: string | null;
    username: string;
  };
  relationship: FriendRelationship;
  context: GateContext;
  returnLinkTo: string;
};

// State-aware gate. The title/description adapt to the relationship so the
// copy reads correctly whether the viewer has sent a request ("Waiting for
// X"), received one ("X wants to be friends"), or neither ("See X's
// profile"). Also surfaces the target's avatar so the gate actually shows
// *who* you're looking at.
export const FriendGateCard = ({
  targetUserId,
  targetUserName,
  targetUser,
  relationship,
  context,
  returnLinkTo,
}: FriendGateCardProps) => {
  const { t } = useTranslation();
  const copy = getGateCopy(relationship.state, context, targetUserName, t);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-12 text-center sm:py-20">
      {targetUser ? (
        <Avatar
          size="l"
          image={
            targetUser.image ? { id: targetUser.image.id, altText: null } : null
          }
          user={{ name: targetUser.name, username: targetUser.username }}
          className="ring-4 ring-background shadow-lg"
        />
      ) : null}

      <div className="flex flex-col items-center gap-2">
        <Text
          as="h1"
          size="2xl"
          weight="semibold"
          className="leading-tight text-foreground"
        >
          {copy.title}
        </Text>
        <Text size="base" className="text-muted-foreground">
          {copy.description}
        </Text>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <FriendActionButton
          variant="primary"
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          relationship={relationship}
        />
        <Button asChild variant="secondary">
          <Link to={returnLinkTo} prefetch="intent">
            {t('friends.navigateAway')}
          </Link>
        </Button>
      </div>
    </div>
  );
};

type TranslateFn = ReturnType<typeof useTranslation>['t'];

function getGateCopy(
  state: FriendRelationship['state'],
  context: GateContext,
  name: string,
  t: TranslateFn,
) {
  const interpolate = { name };
  switch (state) {
    case 'PENDING_OUTGOING':
      return {
        title: t('friends.gateOutgoingTitle', interpolate),
        description: t(
          context === 'profile'
            ? 'friends.gateOutgoingDescriptionProfile'
            : 'friends.gateOutgoingDescriptionWishlist',
          interpolate,
        ),
      };
    case 'PENDING_INCOMING':
      return {
        title: t('friends.gateIncomingTitle', interpolate),
        description: t(
          context === 'profile'
            ? 'friends.gateIncomingDescriptionProfile'
            : 'friends.gateIncomingDescriptionWishlist',
          interpolate,
        ),
      };
    case 'FRIENDS':
    case 'NONE':
    default:
      return {
        title: t(
          context === 'profile'
            ? 'friends.gateNoneTitleProfile'
            : 'friends.gateNoneTitleWishlist',
          interpolate,
        ),
        description: t(
          context === 'profile'
            ? 'friends.gateNoneDescriptionProfile'
            : 'friends.gateNoneDescriptionWishlist',
          interpolate,
        ),
      };
  }
}
