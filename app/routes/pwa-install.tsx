import { type MetaFunction } from '@remix-run/node';
import { Link } from '@remix-run/react';

import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';

const steps = [
  {
    title: 'Open the share sheet',
    description:
      'In Safari, tap the share icon (the square with the upward arrow) in the bottom toolbar.',
    icon: '📤',
  },
  {
    title: 'Choose “Add to Home Screen”',
    description:
      'Scroll the sheet until you find “Add to Home Screen” and tap it to open the preview screen.',
    icon: '➕',
  },
  {
    title: 'Confirm and tap “Add”',
    description:
      'Adjust the name if you like, then press “Add”. GiftPool will appear alongside your other apps.',
    icon: '✅',
  },
] as const;

export const meta: MetaFunction = () => [
  { title: 'Add GiftPool to your Home Screen' },
  {
    name: 'description',
    content: 'Step-by-step guide for installing GiftPool as a Progressive Web App on iOS devices.',
  },
];

const StepCard = ({
  description,
  icon,
  title,
}: (typeof steps)[number]) => {
  return (
    <Card className="h-full space-y-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl"
        >
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  );
};

const PwaInstallInstructions = () => {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="space-y-4 text-center">
        <div className="flex justify-center">
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to GiftPool</Link>
          </Button>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Add GiftPool to your Home Screen
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            These steps work best on iPhone or iPad using Safari.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <StepCard key={step.title} {...step} />
        ))}
      </div>

      <Card className="space-y-3 border-dashed">
        <h2 className="text-lg font-semibold">Why install GiftPool?</h2>
        <p className="text-sm text-muted-foreground">
          Installing GiftPool to your Home Screen gives you full-screen browsing, offline support for
          recent data, and quicker access when you need to check in on gift ideas.
        </p>
        <p className="text-xs text-muted-foreground">
          Tip: If you do not see the share icon, make sure the toolbar is visible by tapping the
          bottom of the screen first.
        </p>
      </Card>
    </div>
  );
};

export default PwaInstallInstructions;
