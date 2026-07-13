import * as E from '@react-email/components';

type FriendRequestReceivedEmailProps = {
  appName: string;
  actorDisplayName: string;
  actorProfileUrl: string;
  managePreferencesUrl: string;
};

export function FriendRequestReceivedEmail({
  appName,
  actorDisplayName,
  actorProfileUrl,
  managePreferencesUrl,
}: FriendRequestReceivedEmailProps) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <E.Heading as="h1">
          {actorDisplayName} sent you a friend request on {appName}
        </E.Heading>
        <E.Text>
          {actorDisplayName} would like to connect with you on {appName}. You
          can view the request and respond at any time.
        </E.Text>
        <E.Button
          href={actorProfileUrl}
          style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '9999px',
            display: 'inline-block',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          View request
        </E.Button>
        <E.Text
          style={{ marginTop: '32px', fontSize: '12px', color: '#64748b' }}
        >
          You are receiving this email because you have enabled friend activity
          email notifications. You can update your preferences at any time.
        </E.Text>
        <E.Link
          href={managePreferencesUrl}
          style={{ fontSize: '12px', color: '#0f172a' }}
        >
          Manage notification preferences
        </E.Link>
      </E.Container>
    </E.Html>
  );
}
