import * as E from '@react-email/components';

type PoolActivityEmailProps = {
  appName: string;
  heading: string;
  message: string;
  poolUrl: string;
  managePreferencesUrl: string;
};

export function PoolActivityEmail({
  appName,
  heading,
  message,
  poolUrl,
  managePreferencesUrl,
}: Readonly<PoolActivityEmailProps>) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <E.Heading as="h1">{heading}</E.Heading>
        <E.Text>{message}</E.Text>
        <E.Button
          href={poolUrl}
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
          Open pool
        </E.Button>
        <E.Text
          style={{ marginTop: '32px', fontSize: '12px', color: '#64748b' }}
        >
          You are receiving this email because you enabled pool coordination
          email notifications on {appName}. You can update your preferences at
          any time.
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
