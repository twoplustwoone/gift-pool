import {
  LuCoffee,
  LuDollarSign,
  LuGift,
  LuShield,
  LuUsers,
} from 'react-icons/lu';
import { Link, type MetaFunction } from 'react-router';
import { Card, CardContent } from '#app/components/ui/card.tsx';
import { cn } from '#app/utils/misc.tsx';

export const meta: MetaFunction = () => [{ title: 'About | GiftPool' }];

const values = [
  {
    icon: <LuUsers className="h-5 w-5" aria-hidden />,
    color: 'text-primary',
    title: 'People first',
    blurb:
      'Gifting is about the people, not the platform. We stay out of the way so you can focus on the people you care about.',
  },
  {
    icon: <LuDollarSign className="h-5 w-5" aria-hidden />,
    color: 'text-pool',
    title: 'No fees, no ads',
    blurb:
      'GiftPool is free. We don\u2019t take a cut, run ads, or sell your data. Your gift budget goes where it should.',
  },
  {
    icon: <LuShield className="h-5 w-5" aria-hidden />,
    color: 'text-pool',
    title: 'Privacy by default',
    blurb:
      'We collect only what we need to run the service. No third-party trackers, no analytics platforms watching you.',
  },
];

const AboutRoute = () => {
  return (
    <div className="container max-w-3xl pb-32 pt-20">
      <section className="text-center">
        <h1 className="text-h1">
          About GiftPool{' '}
          <LuGift className="inline h-8 w-8 text-primary" aria-hidden />
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-body-md leading-relaxed text-muted-foreground">
          GiftPool makes group gifting simple. Create wishlists, coordinate with
          friends, pool contributions, and make sure nobody gets a duplicate
          toaster.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-xl font-semibold tracking-tight md:text-2xl">
          Why we built this
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-body-md leading-relaxed text-muted-foreground">
          Every birthday, holiday, and celebration came with the same chaos:
          scattered group chats, spreadsheets nobody updated, and duplicate
          gifts. GiftPool exists so you can skip the coordination headache and
          get straight to the good part.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-xl font-semibold tracking-tight md:text-2xl">
          What we care about
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {values.map((v) => (
            <Card key={v.title} padding="lg" className="h-full">
              <CardContent>
                <div className="flex flex-col items-center gap-3">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full bg-accent',
                      v.color,
                    )}
                  >
                    {v.icon}
                  </div>
                  <h3 className="text-center text-base font-bold md:text-lg">
                    {v.title}
                  </h3>
                  <p className="text-center text-sm text-muted-foreground md:text-base">
                    {v.blurb}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-xl font-semibold tracking-tight md:text-2xl">
          How GiftPool stays free
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-body-md leading-relaxed text-muted-foreground">
          As an Amazon Associate, GiftPool earns from qualifying purchases.
          Some product links are affiliate links — they cost you nothing and
          never change the price, but they may earn a small commission that
          helps cover hosting.
        </p>
      </section>

      <section className="mt-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
          Have a question?
        </h2>
        <p className="mt-3 text-body-md text-muted-foreground">
          We&apos;d love to hear from you.{' '}
          <Link
            to="/support"
            className="font-medium text-foreground underline hover:no-underline"
          >
            Get in touch
          </Link>
          .
        </p>
      </section>

      <section className="mt-16 rounded-xl border border-border/60 bg-card px-6 py-8 text-center">
        <LuCoffee
          className="mx-auto h-8 w-8 text-warning"
          aria-hidden
        />
        <h2 className="mt-3 text-lg font-semibold tracking-tight">
          Support the project
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          GiftPool is a passion project and will always be free. If it&apos;s
          made your life a little easier, a coffee goes a long way.
        </p>
        <a
          href="https://buymeacoffee.com/twoplustwoone"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-warning px-5 py-2.5 text-sm font-semibold text-warning-foreground shadow-sm transition-colors hover:opacity-90"
        >
          <LuCoffee className="h-4 w-4" aria-hidden />
          Buy me a coffee
        </a>
      </section>
    </div>
  );
};

export default AboutRoute;
