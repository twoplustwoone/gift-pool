import * as E from '@react-email/components';
import {
  FEEDBACK_TYPE_LABELS,
  type FeedbackType,
} from '#app/utils/feedback-validation.ts';

export const FeedbackAcknowledgedEmail = ({
  type,
  message,
  recipientName,
}: {
  type: FeedbackType;
  message: string;
  recipientName?: string | null;
}) => {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <p>
          <E.Text>{greeting}</E.Text>
        </p>
        <p>
          <E.Text>
            Thanks for sending us a {FEEDBACK_TYPE_LABELS[type].toLowerCase()}{' '}
            on GiftPool — it came through and we read every message that lands
            in our inbox. We&apos;ll get back to you if a reply makes sense.
          </E.Text>
        </p>
        <p>
          <E.Text>For reference, here&apos;s what you sent:</E.Text>
        </p>
        <E.Container
          style={{
            borderLeft: '3px solid #e5e7eb',
            paddingLeft: '12px',
            margin: '12px 0',
            whiteSpace: 'pre-wrap',
          }}
        >
          <E.Text>{message}</E.Text>
        </E.Container>
        <p>
          <E.Text>— The GiftPool team</E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
};
