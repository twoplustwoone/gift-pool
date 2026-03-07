import { Link } from 'react-router';
import { type ComponentProps } from 'react';
import { Spacer } from '#app/components/spacer.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { FriendActionButton } from './friend-action-button.tsx';

type FriendRelationship = ComponentProps<
  typeof FriendActionButton
>['relationship'];

type FriendGateCardProps = {
  title: string;
  description: string;
  targetUserId: string;
  targetUserName: string;
  relationship: FriendRelationship;
  returnLinkTo: string;
  returnLinkLabel: string;
};

export const FriendGateCard = ({
  title,
  description,
  targetUserId,
  targetUserName,
  relationship,
  returnLinkLabel,
  returnLinkTo,
}: FriendGateCardProps) => {
  return (
    <div className="container mb-48 mt-36 flex flex-col items-center justify-center">
      <Spacer size="4xs" />

      <div className="container flex max-w-2xl flex-col items-center rounded-3xl bg-muted p-12 text-center">
        <div className="space-y-4">
          <h1 className="text-h2">{title}</h1>
          <p className="text-lg text-muted-foreground">{description}</p>
        </div>

        <Spacer size="md" />

        <div className="flex flex-wrap items-center justify-center gap-4">
          <FriendActionButton
            variant="primary"
            targetUserId={targetUserId}
            targetUserName={targetUserName}
            relationship={relationship}
          />
          <Button asChild variant="secondary">
            <Link to={returnLinkTo} prefetch="intent">
              {returnLinkLabel}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
