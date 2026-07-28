import * as E from '@react-email/components';

type WishlistClaimConflictEmailProps = {
  appName: string;
  itemTitle: string;
  recipientName: string;
  wishlistUrl: string;
  managePreferencesUrl: string;
};

// Deliberately does not name the pool or group that made the decision — the
// recipient of this email may have no relationship to either. See the
// privacy ladder in wishlist-claim-disclosure.ts and the payload comment in
// notification-catalog.ts.
export function WishlistClaimConflictEmail({
  appName,
  itemTitle,
  recipientName,
  wishlistUrl,
  managePreferencesUrl,
}: Readonly<WishlistClaimConflictEmailProps>) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <E.Heading as="h1">
          A group has also decided to get {itemTitle} for {recipientName}
        </E.Heading>
        <E.Text>
          Are you still getting it yourself? If not, release your claim so
          the group can get it without a duplicate purchase.
        </E.Text>
        <E.Button
          href={wishlistUrl}
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
          Open wishlist
        </E.Button>
        <E.Text
          style={{ marginTop: '32px', fontSize: '12px', color: '#64748b' }}
        >
          You are receiving this email because you have enabled pool
          coordination email notifications on {appName}. You can update your
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
