import * as E from '@react-email/components';
import {
  FEEDBACK_TYPE_LABELS,
  type FeedbackType,
} from '#app/utils/feedback-validation.ts';

export const FeedbackReceivedEmail = ({
  type,
  message,
  fromEmail,
  username,
  pageUrl,
  adminUrl,
}: {
  type: FeedbackType;
  message: string;
  fromEmail?: string;
  username?: string;
  pageUrl?: string;
  adminUrl: string;
}) => {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>New {FEEDBACK_TYPE_LABELS[type]} feedback</E.Text>
        </h1>
        <p>
          <E.Text>
            From: {username ? `@${username}` : 'Anonymous'}
            {fromEmail ? ` (${fromEmail})` : ''}
          </E.Text>
        </p>
        {pageUrl ? (
          <p>
            <E.Text>Submitted from: {pageUrl}</E.Text>
          </p>
        ) : null}
        <hr />
        <p>
          <E.Text>{message}</E.Text>
        </p>
        <hr />
        <E.Link href={adminUrl}>Open in admin →</E.Link>
      </E.Container>
    </E.Html>
  );
};
