import { type MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'Terms of Service | GiftPool' },
];

const TermsOfServiceRoute = () => {
  return (
    <div className="container max-w-3xl pb-32 pt-20">
      <h1 className="text-h1">Terms of Service</h1>
      <p className="mt-2 text-body-sm text-muted-foreground">
        Last updated: April 11, 2026
      </p>

      <div className="mt-10 space-y-8 text-body-md leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-h5 text-foreground">1. Acceptance of Terms</h2>
          <p className="mt-2">
            By creating an account or using GiftPool, you agree to these Terms
            of Service and our{' '}
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </a>
            . If you do not agree, please do not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">
            2. Description of Service
          </h2>
          <p className="mt-2">
            GiftPool is a web application that lets users create wishlists,
            coordinate gift-giving within groups, and manage gift pools with
            friends. The service is provided free of charge.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">3. Your Account</h2>
          <p className="mt-2">
            You are responsible for maintaining the security of your account
            credentials. You must provide accurate information when creating your
            account. You may not use another person&apos;s account without
            permission. You must be at least 13 years old to use GiftPool.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">4. Acceptable Use</h2>
          <p className="mt-2">You agree not to:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Use the service for any unlawful purpose</li>
            <li>Harass, abuse, or harm other users</li>
            <li>
              Attempt to gain unauthorized access to the service or other
              accounts
            </li>
            <li>
              Upload malicious content, spam, or content that infringes on
              others&apos; rights
            </li>
            <li>
              Interfere with or disrupt the service or its infrastructure
            </li>
            <li>Scrape, crawl, or otherwise collect data from the service</li>
          </ul>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">5. Your Content</h2>
          <p className="mt-2">
            You retain ownership of the content you create on GiftPool,
            including wishlist items, profile information, and messages. By
            posting content, you grant GiftPool a limited license to store,
            display, and transmit that content as necessary to operate the
            service. You may delete your content at any time.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">6. Gift Coordination</h2>
          <p className="mt-2">
            GiftPool facilitates communication and coordination between users
            for gift-giving purposes. GiftPool is not a party to any gift
            transactions and is not responsible for the purchase, delivery, or
            quality of any gifts. Any financial contributions or purchases
            related to gift pools are made directly between users and are not
            processed through GiftPool.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">
            7. Disclaimer of Warranties
          </h2>
          <p className="mt-2">
            GiftPool is provided &quot;as is&quot; and &quot;as available&quot;
            without warranties of any kind, whether express or implied. We do
            not guarantee that the service will be uninterrupted, secure, or
            error-free. We make no warranties regarding the accuracy or
            reliability of any content on the service.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">
            8. Limitation of Liability
          </h2>
          <p className="mt-2">
            To the maximum extent permitted by law, GiftPool and its operators
            shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages, or any loss of profits or
            revenue, whether incurred directly or indirectly, or any loss of
            data, use, or goodwill arising out of your use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">9. Account Termination</h2>
          <p className="mt-2">
            We may suspend or terminate your account at our discretion if you
            violate these terms. You may delete your account at any time through
            your account settings. Upon termination, your right to use the
            service ceases immediately.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">10. Changes to Terms</h2>
          <p className="mt-2">
            We may update these terms from time to time. If we make material
            changes, we will notify you through the service or by email. Your
            continued use of GiftPool after changes take effect constitutes
            acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-h5 text-foreground">11. Contact</h2>
          <p className="mt-2">
            If you have questions about these terms, please reach out through
            our{' '}
            <a href="/support" className="underline hover:text-foreground">
              support page
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfServiceRoute;
