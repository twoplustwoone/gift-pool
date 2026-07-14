import * as E from '@react-email/components';

type PoolInvitationReceivedEmailProps = {
  appName: string;
  inviterDisplayName: string;
  poolTitle: string;
  recipientLabel: string;
  invitationUrl: string;
  managePreferencesUrl: string;
};

export function PoolInvitationReceivedEmail({
  appName,
  inviterDisplayName,
  poolTitle,
  recipientLabel,
  invitationUrl,
  managePreferencesUrl,
}: PoolInvitationReceivedEmailProps) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <E.Heading as="h1">
          {inviterDisplayName} invited you to a gift pool
        </E.Heading>
        <E.Text>
          Review {poolTitle}. This gift pool is for {recipientLabel}. You can
          decide whether to join after reviewing the invitation.
        </E.Text>
        <E.Button
          href={invitationUrl}
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
          Review invitation
        </E.Button>
        <E.Text
          style={{ marginTop: '32px', fontSize: '12px', color: '#64748b' }}
        >
          You are receiving this email because you have enabled pool invitation
          emails on {appName}. You can update your preferences at any time.
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
