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
        <E.Heading as="h1">
          New {FEEDBACK_TYPE_LABELS[type]} feedback
        </E.Heading>
        <E.Text>
          From: {username ? `@${username}` : 'Anonymous'}
          {fromEmail ? ` (${fromEmail})` : ''}
        </E.Text>
        {pageUrl ? <E.Text>Submitted from: {pageUrl}</E.Text> : null}
        <E.Hr />
        <E.Text>{message}</E.Text>
        <E.Hr />
        <E.Link href={adminUrl}>Open in admin →</E.Link>
      </E.Container>
    </E.Html>
  );
};
