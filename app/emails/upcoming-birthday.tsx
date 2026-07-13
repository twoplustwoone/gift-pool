import * as E from '@react-email/components';

type UpcomingBirthdayEmailProps = {
  appName: string;
  birthdayDisplayName: string;
  // Preformatted by formatBirthdayWhen in app/utils/birthday.ts — 'today',
  // 'tomorrow', or 'on Jul 18'. Passed in as a string to keep the template
  // dumb and the phrasing identical to the in-app notification.
  when: string;
  profileUrl: string;
  managePreferencesUrl: string;
};

export function UpcomingBirthdayEmail({
  appName,
  birthdayDisplayName,
  when,
  profileUrl,
  managePreferencesUrl,
}: Readonly<UpcomingBirthdayEmailProps>) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <E.Heading as="h1">
          {birthdayDisplayName}&apos;s birthday is {when}
        </E.Heading>
        <E.Text>
          Get ahead of it — see their wishlist or start a gift pool before the
          day arrives.
        </E.Text>
        <E.Button
          href={profileUrl}
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
          View {birthdayDisplayName}&apos;s profile
        </E.Button>
        <E.Text
          style={{ marginTop: '32px', fontSize: '12px', color: '#64748b' }}
        >
          You are receiving this email because you have enabled birthday
          reminder email notifications on {appName}. You can update your
          preferences at any time.
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
