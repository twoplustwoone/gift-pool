import { LuBug, LuLightbulb, LuMail, LuMessageCircle } from 'react-icons/lu';
import { type MetaFunction } from 'react-router';
import { Card, CardContent } from '#app/components/ui/card.tsx';
import { cn } from '#app/utils/misc.tsx';

export const meta: MetaFunction = () => [{ title: 'Support | GiftPool' }];

const channels = [
  {
    icon: <LuMail className="h-5 w-5" aria-hidden />,
    color: 'text-primary',
    title: 'Email us',
    description: 'For account issues, questions, or anything else.',
    action: 'support@giftpool.app',
    href: 'mailto:support@giftpool.app',
  },
  {
    icon: <LuBug className="h-5 w-5" aria-hidden />,
    color: 'text-yellow-500',
    title: 'Report a bug',
    description:
      'Something broken? Let us know and we\u2019ll get it sorted.',
    action: 'File a report',
    href: 'mailto:support@giftpool.app?subject=Bug%20Report',
  },
  {
    icon: <LuLightbulb className="h-5 w-5" aria-hidden />,
    color: 'text-green-500',
    title: 'Suggest a feature',
    description: 'Got an idea that would make GiftPool better? We\u2019re all ears.',
    action: 'Send a suggestion',
    href: 'mailto:support@giftpool.app?subject=Feature%20Suggestion',
  },
];

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
    a: 'No. GiftPool coordinates who\u2019s contributing what, but actual money transfers happen directly between people however they prefer (Venmo, cash, etc.).',
  },
  {
    q: 'Can I delete my account?',
    a: 'Yes. Head to Settings and you\u2019ll find the option to delete your account and all associated data.',
  },
  {
    q: 'Who can see my wishlist?',
    a: 'By default, only your friends on GiftPool. You can also create a public share link for anyone.',
  },
];

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
          Need help or have feedback? Here&apos;s how to reach us.
        </p>
      </section>

      <section className="mt-12">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {channels.map((c) => (
            <Card key={c.title} padding="lg" className="h-full">
              <CardContent>
                <div className="flex flex-col items-center gap-3 text-center">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full bg-accent',
                      c.color,
                    )}
                  >
                    {c.icon}
                  </div>
                  <h2 className="text-base font-bold md:text-lg">{c.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {c.description}
                  </p>
                  <a
                    href={c.href}
                    className="mt-1 text-sm font-medium text-foreground underline hover:no-underline"
                  >
                    {c.action}
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
    </div>
  );
};

export default SupportRoute;
