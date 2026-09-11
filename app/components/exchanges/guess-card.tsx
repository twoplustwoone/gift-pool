import { useState } from 'react';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { PresetPicker } from '#app/components/ui/preset-picker.tsx';
import {
  type ExchangePerson,
  type GuessView,
  type NoteThreads,
} from '#app/utils/exchanges.server.ts';

const firstName = (person: { name: string | null; username: string }) =>
  (person.name ?? person.username).split(' ')[0] ?? person.username;

// Invitational, not a scoreboard prompt (board §8): it references what you
// already have to work with rather than counting anything down.
function invitation(threads: NoteThreads | null, hasGuess: boolean): string {
  const delivered =
    threads?.fromYourGifter.filter((n) => !n.pending).length ?? 0;
  if (hasGuess) {
    return 'You can change your mind as often as you like until the reveal.';
  }
  if (delivered === 0) {
    return 'No notes yet, but you can still call it. You can change your mind as often as you like until the reveal.';
  }
  const notes = delivered === 1 ? 'One note in' : `${delivered} notes in`;
  return `${notes} and no guess yet. You can change your mind as often as you like until the reveal.`;
}

export function GuessCard({
  candidates,
  guess,
  threads,
  pending,
  onGuess,
}: {
  candidates: ExchangePerson[];
  guess: GuessView | null;
  threads: NoteThreads | null;
  pending: boolean;
  onGuess: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The guess projection carries only id/name/username; the roster has the
  // image, so the card matches them up rather than widening the projection.
  const guessedId = guess?.guessedUser?.id ?? null;
  const guessed = guessedId
    ? (candidates.find((c) => c.id === guessedId) ?? null)
    : null;

  return (
    <section className="rounded-2xl border p-4" aria-label="Who has you?">
      <h3 className="text-sm font-medium text-foreground">Who has you?</h3>

      {guessed ? (
        <div className="mt-3 flex items-center gap-3">
          <Avatar
            size="s"
            className="!h-9 !w-9"
            image={guessed.image}
            user={guessed}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {guessed.name ?? guessed.username}
            </p>
            <p className="text-xs text-muted-foreground">
              Your guess
              {guess && guess.changeCount > 0
                ? ` · changed ${guess.changeCount === 1 ? 'once' : `${guess.changeCount} times`}`
                : null}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            disabled={pending}
          >
            Change
          </Button>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        {invitation(threads, Boolean(guessed))}
      </p>

      {guessed ? null : (
        <Button
          type="button"
          className="mt-3"
          onClick={() => setOpen(true)}
          disabled={pending || candidates.length === 0}
        >
          Make a guess
        </Button>
      )}

      <PresetPicker
        open={open}
        onOpenChange={setOpen}
        title="Who has you?"
        description="One guess at a time. Change it as often as you like — we'll keep the last one you land on."
        options={candidates.map((person) => ({
          key: person.id,
          label: person.name ?? person.username,
        }))}
        sendLabel={(selected) => `Lock in ${selected.label.split(' ')[0]}`}
        // The board's wording (§17): the announcement says what the guess is
        // now, not that a row was selected.
        announceSelection={(option) => `Your guess is now ${option.label}`}
        onSend={(userId) => {
          onGuess(userId);
          setOpen(false);
        }}
        pending={pending}
        footnote="Nobody is told you guessed them."
        emptyLabel="There's nobody to guess yet."
      />
    </section>
  );
}

export { firstName as guessCardFirstName };
