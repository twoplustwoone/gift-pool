import { LuMessageCircle } from 'react-icons/lu';
import { type MetaFunction } from 'react-router';
import { FeedbackForm } from '#app/components/feedback/feedback-form.tsx';
import { Card, CardContent } from '#app/components/ui/card.tsx';

export const meta: MetaFunction = () => [{ title: 'Support | GiftPool' }];

const faqs = [
  {
    q: 'Is GiftPool free?',
    a: 'Yes, completely. No fees, no premium tiers, no ads.',
  },
  {
    q: 'How do gift pools work?',
    a: 'One person creates a pool for a recipient, invites contributors, and the group votes on what to get. Once decided, someone purchases and delivers the gift.',
  },
  {
    q: 'Does GiftPool handle payments?',
    a: 'No. GiftPool coordinates who’s contributing what, but actual money transfers happen directly between people however they prefer (Venmo, cash, etc.).',
  },
  {
    q: 'Can I delete my account?',
    a: 'Yes. Head to Settings and you’ll find the option to delete your account and all associated data.',
  },
  {
    q: 'Who can see my wishlist?',
    a: 'By default, only your friends on GiftPool. You can also create a public share link for anyone.',
  },
];

// Required by the Amazon Associates Operating Agreement — the exact statement
// must appear on the site. Keep in sync with the matching section on /about.
const AFFILIATE_DISCLOSURE =
  'As an Amazon Associate, GiftPool earns from qualifying purchases. Some product links on wishlists and gift ideas are affiliate links — clicking them costs you nothing and never changes the price, but GiftPool may earn a small commission that helps cover hosting.';

const SupportRoute = () => {
  return (
    <div className="container max-w-3xl pb-32 pt-20">
      <section className="text-center">
        <h1 className="text-h1">
          Support{' '}
          <LuMessageCircle
            className="inline h-8 w-8 text-primary"
            aria-hidden
          />
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-body-md leading-relaxed text-muted-foreground">
          Need help or have feedback? Send us a message and we&apos;ll get back
          to you.
        </p>
      </section>

      <section className="mt-12">
        <Card padding="lg">
          <CardContent>
            <FeedbackForm className="mx-auto max-w-xl" />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Prefer email? Reach us directly at{' '}
          <a
            href="mailto:support@giftpool.app"
            className="font-medium text-foreground underline hover:no-underline"
          >
            support@giftpool.app
          </a>
          .
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-xl font-semibold tracking-tight md:text-2xl">
          Frequently asked questions
        </h2>
        <dl className="mt-6 divide-y divide-border">
          {faqs.map((faq) => (
            <div key={faq.q} className="py-5">
              <dt className="text-body-md font-semibold text-foreground">
                {faq.q}
              </dt>
              <dd className="mt-2 text-body-md leading-relaxed text-muted-foreground">
                {faq.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16" id="affiliate">
        <h2 className="text-center text-xl font-semibold tracking-tight md:text-2xl">
          Affiliate links
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-body-md leading-relaxed text-muted-foreground">
          {AFFILIATE_DISCLOSURE}
        </p>
      </section>
    </div>
  );
};

export default SupportRoute;
