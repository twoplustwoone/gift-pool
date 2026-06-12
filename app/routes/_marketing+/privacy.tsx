import { type MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'Privacy Policy | GiftPool' },
];

const PrivacyRoute = () => {
  return (
    <div className="container max-w-3xl pb-32 pt-20">
      <h1 className="text-h1">Privacy Policy</h1>
      <p className="mt-2 text-body-sm text-muted-foreground">
        Last updated: June 12, 2026
      </p>

      <div className="mt-10 space-y-8 text-body-md leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-h5 text-foreground">1. Information We Collect</h2>

          <h3 className="mt-4 text-body-md font-semibold text-foreground">
            Account information
          </h3>
          <p className="mt-1">
            When you create an account, we collect your email address, username,
            display name, and password (stored in hashed form). You may
            optionally provide a birthday, mailing address, bio, and profile
            photo.
          </p>

          <h3 className="mt-4 text-body-md font-semibold text-foreground">
            Content you create
          </h3>
          <p className="mt-1">
            This includes wishlist items (names, descriptions, links, images),
            gift pool participation, group memberships, and friend connections.
          </p>

          <h3 className="mt-4 text-body-md font-semibold text-foreground">
            Usage data
          </h3>
          <p className="mt-1">
            We collect analytics events about how you use GiftPool, such as
            feature usage and navigation patterns. This data is associated with
            your account and stored in our database. If you visit GiftPool
            without an account (for example, opening a shared wishlist or an
            invite link), these events are associated with a random first-party
            visitor identifier instead. We do not use third-party analytics or
            advertising trackers.
          </p>

          <h3 className="mt-4 text-body-md font-semibold text-foreground">
            Technical data
          </h3>
          <p className="mt-1">
            We automatically collect request IDs and session identifiers for
            operational purposes.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">
            2. How We Use Your Information
          </h2>
          <p className="mt-2">We use your information to:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Operate and maintain the GiftPool service</li>
            <li>
              Send you transactional emails (account verification, friend
              requests, gift pool notifications)
            </li>
            <li>
              Display your profile and wishlist to users you have connected with
            </li>
            <li>Improve the service based on usage patterns</li>
            <li>Detect and prevent abuse or security issues</li>
          </ul>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">3. Third-Party Services</h2>
          <p className="mt-2">We share limited data with the following:</p>
          <ul className="mt-2 list-inside list-disc space-y-2">
            <li>
              <strong className="text-foreground">Resend</strong> — our email
              delivery provider. Your email address is shared when we send
              transactional emails (e.g., verification codes, friend request
              notifications).
            </li>
            <li>
              <strong className="text-foreground">Sentry</strong> — our error
              monitoring service. When errors occur, technical data (request
              IDs, session IDs, and error details) may be sent to Sentry for
              debugging. This may incidentally include your user ID.
            </li>
            <li>
              <strong className="text-foreground">GitHub</strong> — if you
              choose to sign in with GitHub, we receive your email address and
              profile information from GitHub&apos;s OAuth service.
            </li>
          </ul>
          <p className="mt-2">
            We do not sell your data. We do not share your information with
            advertisers.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">4. Cookies and Sessions</h2>
          <p className="mt-2">
            GiftPool uses a session cookie (<code>en_session</code>) to keep you
            logged in. This cookie is HTTP-only (not accessible to JavaScript),
            uses secure transmission in production, and expires after 30 days by
            default. If you select &quot;remember me&quot; during login, the
            cookie persists for the full session duration.
          </p>
          <p className="mt-2">
            We also set a first-party analytics cookie (<code>gp_visitor</code>)
            containing a random identifier with no personal information. It
            helps us understand where visitors drop off — for example, how many
            people open an invite link but never join. It is HTTP-only, never
            shared with third parties, and not used for advertising. We do not
            use advertising or third-party tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">5. Data Storage</h2>
          <p className="mt-2">
            Your data is stored in a SQLite database hosted on Fly.io
            infrastructure. Passwords are hashed using bcrypt before storage. We
            take reasonable measures to protect your data, but no method of
            electronic storage is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">
            6. Your Choices and Controls
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong className="text-foreground">
                Notification preferences
              </strong>{' '}
              — you can control which notifications you receive (in-app and
              email) from your account settings.
            </li>
            <li>
              <strong className="text-foreground">Birthday visibility</strong> —
              you can choose who can see your birthday: friends, everyone, or
              nobody.
            </li>
            <li>
              <strong className="text-foreground">Profile information</strong> —
              you can update or remove your optional profile details at any time
              in your settings.
            </li>
            <li>
              <strong className="text-foreground">Account deletion</strong> —
              you can delete your account through your account settings. This
              removes your profile, wishlists, and associated data.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">7. Data Retention</h2>
          <p className="mt-2">
            We retain your account data for as long as your account is active.
            Expired sessions and stale verification tokens are periodically
            cleaned up. If you delete your account, your personal data is
            removed from our active database.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">
            8. Children&apos;s Privacy
          </h2>
          <p className="mt-2">
            GiftPool is not intended for children under 13. We do not knowingly
            collect personal information from children under 13. If you believe
            a child under 13 has created an account, please contact us so we can
            remove it.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">9. Changes to This Policy</h2>
          <p className="mt-2">
            We may update this privacy policy from time to time. If we make
            material changes, we will notify you through the service or by
            email. The &quot;last updated&quot; date at the top indicates when
            this policy was last revised.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">10. Contact</h2>
          <p className="mt-2">
            If you have questions about this privacy policy or how your data is
            handled, please reach out through our{' '}
            <a href="/support" className="underline hover:text-foreground">
              support page
            </a>
            {'.'}
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyRoute;
