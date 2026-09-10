import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { DrawControls } from '../app/components/exchanges/draw-controls';
import { ExchangeEmptyState } from '../app/components/exchanges/exchange-empty-state';
import {
  ExchangeJoinPrompt,
  ExchangeQuietLine,
} from '../app/components/exchanges/exchange-join-prompt';
import {
  ExchangeRoster,
  ExchangeRosterStrip,
} from '../app/components/exchanges/exchange-roster';
import { ExchangeSettingsFields } from '../app/components/exchanges/exchange-settings-fields';
import { ExchangeSkeleton } from '../app/components/exchanges/exchange-skeleton';
import { ExchangeStatusBadge } from '../app/components/exchanges/exchange-status-badge';
import { GiftProgressStepper } from '../app/components/exchanges/gift-progress-stepper';
import { OrganizerProgressPanel } from '../app/components/exchanges/organizer-progress-panel';
import { ReceivedCard } from '../app/components/exchanges/received-card';
import { RevealControls } from '../app/components/exchanges/reveal-controls';
import { RevealedLoop } from '../app/components/exchanges/revealed-loop';
import { YouDrewCard } from '../app/components/exchanges/you-drew-card';
import { YourGifterCard } from '../app/components/exchanges/your-gifter-card';
import { YourPersonCard } from '../app/components/exchanges/your-person-card';
import { Button } from '../app/components/ui/button';
import {
  type ExchangePerson,
  type RevealedPair,
  type RosterEntry,
} from '../app/utils/exchanges.server';

const person = (id: string, name: string): ExchangePerson => ({
  id,
  username: id,
  name,
  image: null,
});
const fd = person('fd', 'Francisco Di Giandomenico');
const np = person('np', 'Nicolas Posse');
const nb = person('nb', 'Nicolas Burroni');
const fc = person('fc', 'Francisco Ceriani');
const al = person('al', 'Agustin Luque');
const jl = person('jl', 'Juan Longo');

const roster: RosterEntry[] = [
  { user: fd, status: 'IN', isOrganizer: true },
  { user: np, status: 'IN', isOrganizer: false },
  { user: nb, status: 'IN', isOrganizer: false },
  { user: fc, status: 'IN', isOrganizer: false },
  { user: al, status: 'IN', isOrganizer: false },
  { user: jl, status: 'PENDING', isOrganizer: false },
];

const loop: RevealedPair[] = [
  {
    gifter: nb,
    giftee: np,
    giftLabel: 'a record player stand',
    outcome: 'LOVED',
  },
  {
    gifter: np,
    giftee: al,
    giftLabel: 'a ceramics class voucher',
    outcome: 'LOVED',
  },
  { gifter: al, giftee: fd, giftLabel: 'a set of brushes', outcome: 'OKAY' },
  { gifter: fd, giftee: fc, giftLabel: null, outcome: null },
  { gifter: fc, giftee: nb, giftLabel: 'a leather notebook', outcome: 'LOVED' },
];

const NOW = new Date('2026-12-12T12:00:00Z');
const EVENT = '2026-12-24T00:00:00Z';

const meta = {
  title: 'Exchanges/Components',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StageBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(
        [
          'GATHERING',
          'DRAWN',
          'TODAY',
          'READY_TO_REVEAL',
          'REVEALED',
          'FINISHED',
          'CANCELLED',
        ] as const
      ).map((stage) => (
        <ExchangeStatusBadge key={stage} stage={stage} />
      ))}
    </div>
  ),
};

export const OrganizerRoster: Story = {
  render: () => (
    <ExchangeRoster
      roster={[
        ...roster.slice(0, 5),
        { user: jl, status: 'OUT', isOrganizer: false },
      ]}
      viewerId="fd"
      renderTrailing={(entry) =>
        entry.status === 'PENDING' ? (
          <Button size="sm" variant="outline">
            Remind
          </Button>
        ) : null
      }
    />
  ),
};

export const ParticipantRosterStrip: Story = {
  render: () => <ExchangeRosterStrip roster={roster} viewerId="np" />,
};

export const DrawFooter: Story = {
  render: () => (
    <DrawControls
      exchangeId="x1"
      preview={{
        kind: 'ok',
        participantCount: 5,
        names: roster.slice(0, 5).map((r) => r.user.name!),
        repeats: 'NONE',
      }}
    />
  ),
};

export const DrawTooFew: Story = {
  render: () => (
    <DrawControls
      exchangeId="x1"
      preview={{ kind: 'TOO_FEW', have: 2, need: 3 }}
    />
  ),
};

export const DrawInfeasible: Story = {
  render: () => (
    <DrawControls
      exchangeId="x1"
      onRemoveExclusion={() => {}}
      preview={{
        kind: 'INFEASIBLE',
        blockedUserId: 'nb',
        blockedName: 'Nicolas Burroni',
        exclusions: [
          { id: 'e1', aName: 'Nicolas Burroni', bName: 'Agustin Luque' },
          { id: 'e2', aName: 'Nicolas Burroni', bName: 'Nicolas Posse' },
        ],
      }}
    />
  ),
};

export const YouDrew: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <YouDrewCard
          exchangeId="x1"
          exchangeTitle="The Painted 2026"
          assignment={{
            id: 'a1',
            giftee: al,
            giftStage: 'NONE',
            giftStageAt: null,
            giftLabel: null,
            personChangedAt: null,
            wishlistItemCount: 4,
            canViewWishlist: true,
          }}
          organizer={fd}
          spendingGuideline="Around $50"
          eventDate={EVENT}
          exchangeHref="/exchanges/x1"
          viewerIsOrganizer={false}
          open={open}
          onOpenChange={setOpen}
        />
      </>
    );
  },
};

export const ParticipantDrawn: Story = {
  render: () => (
    <div className="space-y-4">
      <YourPersonCard
        assignment={{
          id: 'a1',
          giftee: al,
          giftStage: 'GOT_IT',
          giftStageAt: null,
          giftLabel: null,
          personChangedAt: null,
          wishlistItemCount: 4,
          canViewWishlist: true,
        }}
        spendingGuideline="Around $50"
        eventDate={EVENT}
        viewerIsFriendOfGiftee={false}
      />
      <GiftProgressStepper
        exchangeId="x1"
        stage="GOT_IT"
        gifteeFirstName="Agustin"
      />
    </div>
  ),
};

export const ExchangeDay: Story = {
  render: () => (
    <div className="space-y-4">
      <GiftProgressStepper
        exchangeId="x1"
        stage="WRAPPED"
        gifteeFirstName="Agustin"
        lead
      />
      <ReceivedCard exchangeId="x1" received={null} />
    </div>
  ),
};

export const OrganizerDrawn: Story = {
  render: () => (
    <OrganizerProgressPanel
      progress={{ total: 5, haveGift: 4, wrapped: 2, given: 0, received: 0 }}
      afterEvent={false}
    />
  ),
};

export const OrganizerReadyToReveal: Story = {
  render: () => (
    <OrganizerProgressPanel
      progress={{ total: 5, haveGift: 5, wrapped: 5, given: 5, received: 4 }}
      afterEvent
      actions={
        <RevealControls
          exchangeId="x1"
          progress={{
            total: 5,
            haveGift: 5,
            wrapped: 5,
            given: 5,
            received: 4,
          }}
          autoRevealAt="2026-12-27T00:00:00Z"
          eventDate={EVENT}
          now={new Date('2026-12-25T12:00:00Z')}
        />
      }
    />
  ),
};

export const OrganizerAutoRevealOff: Story = {
  render: () => (
    <OrganizerProgressPanel
      progress={{ total: 5, haveGift: 5, wrapped: 5, given: 5, received: 5 }}
      afterEvent
      actions={
        <RevealControls
          exchangeId="x1"
          progress={{
            total: 5,
            haveGift: 5,
            wrapped: 5,
            given: 5,
            received: 5,
          }}
          autoRevealAt={null}
          eventDate={EVENT}
          now={new Date('2026-12-29T12:00:00Z')}
        />
      }
    />
  ),
};

export const Revealed: Story = {
  render: () => (
    <div className="space-y-4">
      <YourGifterCard gifter={nb} guessedRight={null} />
      <RevealedLoop loop={loop} viewerId="np" canAddGiftLabel />
    </div>
  ),
};

export const RevealedDesktop: Story = {
  ...Revealed,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="mx-auto max-w-3xl">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

export const JoinPromptAndQuietLine: Story = {
  render: () => (
    <div className="space-y-4">
      <ExchangeJoinPrompt
        exchange={{
          id: 'x1',
          title: 'The Painted 2026',
          occasionType: 'HOLIDAY',
          eventDate: EVENT,
          organizer: fd,
        }}
        participantCount={5}
      />
      <ExchangeQuietLine exchange={{ id: 'x1', title: 'The Painted 2026' }} />
    </div>
  ),
};

export const EmptyStates: Story = {
  render: () => (
    <div className="space-y-4">
      <ExchangeEmptyState
        variant="group"
        groupName="The Painted"
        groupId="g1"
      />
      <ExchangeEmptyState variant="list" />
    </div>
  ),
};

export const Skeleton: Story = {
  render: () => <ExchangeSkeleton />,
};

export const SettingsForm: Story = {
  render: () => (
    <form className="space-y-4">
      <ExchangeSettingsFields
        mode="create"
        isGroup
        groupName="The Painted"
        members={[fd, np, nb, fc, al, jl]}
        defaults={{ title: 'The Painted 2026', eventDate: '2026-12-24' }}
        initialExclusions={[{ userA: nb, userB: al }]}
      />
    </form>
  ),
};

export const SettingsFormStandalone: Story = {
  render: () => (
    <form className="space-y-4">
      <ExchangeSettingsFields mode="create" isGroup={false} members={[fd]} />
    </form>
  ),
};

// Unused-import guard for story typing.
void NOW;
