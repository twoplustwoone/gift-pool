import * as E from '@react-email/components';

type ExchangeActivityEmailProps = {
  appName: string;
  // Preformatted by the renderer so the phrasing is identical to the in-app
  // notification. Never names a drawn person.
  heading: string;
  message: string;
  exchangeUrl: string;
  buttonLabel: string;
  managePreferencesUrl: string;
};

export function ExchangeActivityEmail({
  appName,
  heading,
  message,
  exchangeUrl,
  buttonLabel,
  managePreferencesUrl,
}: Readonly<ExchangeActivityEmailProps>) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <E.Heading as="h1">{heading}</E.Heading>
        <E.Text>{message}</E.Text>
        <E.Button
          href={exchangeUrl}
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
          {buttonLabel}
        </E.Button>
        <E.Text
          style={{ marginTop: '32px', fontSize: '12px', color: '#64748b' }}
        >
          You are receiving this email because you enabled gift exchange email
          notifications on {appName}. You can update your preferences at any
          time.
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
