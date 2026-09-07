import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { GiftingSegments } from '../app/components/gifting/gifting-segments';
import { Button } from '../app/components/ui/button';
import { ConfirmDialog } from '../app/components/ui/confirm-dialog';
import { SecrecyNote } from '../app/components/ui/secrecy-note';
import { Switch, SwitchRow } from '../app/components/ui/switch';

const meta = {
  title: 'Primitives/Exchanges foundations',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Switches: Story = {
  render: () => {
    const [a, setA] = useState(true);
    const [b, setB] = useState(false);
    return (
      <div className="max-w-md space-y-2">
        <Switch label="Bare switch" checked={a} onCheckedChange={setA} />
        <SwitchRow
          id="someone-new"
          title="Give everyone someone new"
          description="Avoids anyone you drew in the last two draws in The Painted."
          checked={a}
          onCheckedChange={setA}
        />
        <SwitchRow
          id="auto-reveal"
          title="Reveal for me if I forget"
          description="So the group isn't left waiting on you."
          checked={b}
          onCheckedChange={setB}
        />
      </div>
    );
  },
};

export const DrawConfirmation: Story = {
  render: () => (
    <ConfirmDialog
      title="Draw names for 5 people?"
      description="Francisco Di Giandomenico, Nicolas Posse, Nicolas Burroni, Francisco Ceriani and Agustin Luque."
      consequences={[
        'Nobody can join or leave afterwards without starting a new draw.',
        "You'll draw a name too, and you won't see anybody else's.",
      ]}
      outcomePreview="Everyone gets someone new this year."
      confirmText="Draw names"
      cancelText="Not yet"
      onConfirm={() => {}}
    >
      <Button>Draw names</Button>
    </ConfirmDialog>
  ),
};

export const PendingConfirmation: Story = {
  render: () => (
    <ConfirmDialog
      open
      title="Show everyone who had who?"
      consequences={[
        'All five of you see the whole loop at the same moment.',
        'Guesses lock and the scoreboard is worked out.',
        "It can't be undone.",
      ]}
      caution="One person hasn't said they got their gift yet. Their pairing will still show."
      confirmText="Reveal the pairings"
      cancelText="Not yet"
      pending
      pendingLabel="Revealing…"
      pendingHint="Telling everyone at once."
      onConfirm={() => {}}
    />
  ),
};

export const Secrecy: Story = {
  render: () => (
    <div className="max-w-md space-y-3">
      <SecrecyNote title="Totals only">
        You can't see who has who, who sent what, or anything about one person.
      </SecrecyNote>
      <SecrecyNote>
        There are no pairings yet, so this page is fully public to the group.
        Everything secret starts one tap away.
      </SecrecyNote>
    </div>
  ),
};

export const Segments: Story = {
  render: () => (
    <MemoryRouter initialEntries={['/pools']}>
      <div className="space-y-3">
        <GiftingSegments active="pools" />
        <GiftingSegments active="exchanges" />
      </div>
    </MemoryRouter>
  ),
};
