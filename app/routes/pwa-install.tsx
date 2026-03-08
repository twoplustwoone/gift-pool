import { type MetaFunction } from 'react-router';
import { Link, useSearchParams } from 'react-router';

import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';

const instructionSets = [
  {
    id: 'ios-safari',
    title: 'Safari on iPhone or iPad',
    description:
      'Safari exposes the share sheet along the bottom of the screen. Use it to add GiftPool to your Home Screen.',
    steps: [
      {
        title: 'Open the share sheet',
        description:
          'Tap the share icon (the square with the upward arrow) in the bottom toolbar.',
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
    ],
  },
  {
    id: 'ios-chrome',
    title: 'Chrome on iPhone or iPad',
    description:
      'Chrome offers the same install capability, but the share button lives in the top-right of the toolbar.',
    steps: [
      {
        title: 'Open Chrome’s share menu',
        description:
          'Tap the share icon (the square with the upward arrow) next to the address bar at the top of the screen.',
        icon: '📤',
      },
      {
        title: 'Find “Add to Home Screen”',
        description:
          'Scroll or search within the share sheet until you see “Add to Home Screen”, then tap it.',
        icon: '➕',
      },
      {
        title: 'Confirm and tap “Add”',
        description:
          'Edit the shortcut name if you like, then press “Add” to place GiftPool alongside your other apps.',
        icon: '✅',
      },
    ],
  },
] as const;

export const meta: MetaFunction = () => [
  { title: 'Add GiftPool to your Home Screen' },
  {
    name: 'description',
    content:
      'Step-by-step guide for installing GiftPool as a Progressive Web App on iOS devices using Safari or Chrome.',
  },
];

const StepCard = ({ description, icon, title }: StepCardProps) => {
  return (
    <Card className="h-full space-y-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl"
        >
          {icon}
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  );
};

type StepCardProps = (typeof instructionSets)[number]['steps'][number];

const InstructionSection = ({
  description,
  id,
  isHighlighted,
  steps,
  title,
}: (typeof instructionSets)[number] & { isHighlighted: boolean }) => {
  return (
    <section
      id={id}
      className={`space-y-6 rounded-lg border border-border/60 bg-card/60 p-6 shadow-sm transition-shadow ${
        isHighlighted ? 'ring-2 ring-primary' : ''
      }`}
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <StepCard key={step.title} {...step} />
        ))}
      </div>
    </section>
  );
};

const PwaInstallInstructions = () => {
  const [searchParams] = useSearchParams();
  const activePlatform = searchParams.get('platform');

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
            These steps walk you through adding GiftPool using Safari or Chrome
            on iOS.
          </p>
        </div>
      </header>

      <div className="space-y-6">
        {instructionSets.map((instructionSet) => (
          <InstructionSection
            key={instructionSet.id}
            {...instructionSet}
            isHighlighted={instructionSet.id === activePlatform}
          />
        ))}
      </div>

      <Card className="space-y-3 border-dashed">
        <h2 className="text-lg font-semibold">Why install GiftPool?</h2>
        <p className="text-sm text-muted-foreground">
          Installing GiftPool to your Home Screen gives you full-screen
          browsing, offline support for recent data, and quicker access when you
          need to check in on gift ideas.
        </p>
        <p className="text-xs text-muted-foreground">
          Tip: If you do not see the share icon, make sure the toolbar is
          visible by tapping the bottom of the screen first.
        </p>
      </Card>
    </div>
  );
};

export default PwaInstallInstructions;
