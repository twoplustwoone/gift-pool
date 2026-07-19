import * as React from 'react';
import { LuGift, LuPartyPopper, LuUsers } from 'react-icons/lu';
import { cn } from '#app/utils/misc.tsx';
import { HOME_COPY, type HomeStep } from './home-copy';

const stepMeta: Record<
  HomeStep['key'],
  { icon: React.ReactNode; iconClass: string }
> = {
  start: {
    icon: <LuGift className="h-5 w-5" aria-hidden />,
    iconClass: 'text-primary',
  },
  invite: {
    icon: <LuUsers className="h-5 w-5" aria-hidden />,
    iconClass: 'text-pool',
  },
  give: {
    icon: <LuPartyPopper className="h-5 w-5" aria-hidden />,
    iconClass: 'text-primary',
  },
};

// §6.1: a short, scannable explanation of how coordination works and what
// remains private. Tonal grouping, no card-per-bullet, no money styling.
export const HomeHowItWorks: React.FC = () => {
  return (
    <section
      aria-labelledby="home-how-heading"
      className="container pb-8 md:pb-12"
    >
      <h2
        id="home-how-heading"
        className="font-display text-xl font-semibold tracking-tight md:text-2xl"
      >
        {HOME_COPY.howItWorks.heading}
      </h2>
      <ol className="mt-4 grid grid-cols-1 gap-4 md:mt-6 md:grid-cols-3">
        {HOME_COPY.howItWorks.steps.map((step, i) => (
          <li
            key={step.key}
            data-testid={`how-step-${step.key}`}
            className="rounded-xl bg-background-muted p-5"
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background',
                  stepMeta[step.key].iconClass,
                )}
              >
                {stepMeta[step.key].icon}
              </div>
              <h3 className="text-base font-bold">
                <span className="text-muted-foreground">{i + 1}.</span>{' '}
                {step.title}
              </h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground md:text-base">
              {step.blurb}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        {HOME_COPY.howItWorks.privacyNote}
      </p>
    </section>
  );
};
