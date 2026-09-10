import {
  type NoteThreads,
  type NoteView,
} from '#app/utils/exchanges.server.ts';
import { cn } from '#app/utils/misc.tsx';

// Two threads, never merged (board §7). Within one, your notes sit right and
// teal; theirs sit left and unattributed, because knowing which of five people
// wrote it is the whole game.
function Bubble({ note }: { note: NoteView }) {
  const named = note.from?.name ?? note.from?.username ?? null;
  return (
    <li
      className={cn('flex', note.mine ? 'justify-end' : 'justify-start')}
      data-testid={note.mine ? 'note-mine' : 'note-theirs'}
    >
      <div className="max-w-[85%] space-y-1">
        <p
          className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            note.mine
              ? 'bg-pool/15 text-foreground'
              : 'bg-muted text-foreground',
            note.pending && 'opacity-70',
          )}
        >
          {note.text}
        </p>
        <p
          className={cn(
            'text-xs text-muted-foreground',
            note.mine ? 'text-right' : 'text-left',
          )}
        >
          {named ? `${named} · ` : null}
          {note.pending ? `Sending · ${note.when.toLowerCase()}` : note.when}
        </p>
      </div>
    </li>
  );
}

function Thread({
  title,
  notes,
  countLabel,
  empty,
  action,
}: {
  title: string;
  notes: NoteView[];
  countLabel?: string;
  empty: { title: string; body: string };
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border p-4" aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {countLabel ? (
          <span className="text-xs text-muted-foreground">{countLabel}</span>
        ) : null}
      </div>
      {notes.length === 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium text-foreground">{empty.title}</p>
          <p className="text-xs text-muted-foreground">{empty.body}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((note) => (
            <Bubble key={note.id} note={note} />
          ))}
        </ul>
      )}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

export function NotesThreads({
  threads,
  personFirstName,
  replyAction,
  sendAction,
}: {
  threads: NoteThreads;
  personFirstName: string;
  replyAction?: React.ReactNode;
  sendAction?: React.ReactNode;
}) {
  const countLabel = (notes: NoteView[]) => {
    const delivered = notes.filter((n) => !n.pending).length;
    if (delivered === 0) return undefined;
    return delivered === 1 ? '1 note' : `${delivered} notes`;
  };

  return (
    <div className="space-y-4" data-testid="notes-threads">
      <Thread
        title="From your secret gifter"
        notes={threads.fromYourGifter}
        countLabel={countLabel(threads.fromYourGifter)}
        empty={{
          title: 'Nothing yet',
          body: "Whoever has you might send a note or a clue. If they don't, that's a clue too.",
        }}
        action={replyAction}
      />
      <Thread
        title={`To ${personFirstName}`}
        notes={threads.toYourPerson}
        countLabel={countLabel(threads.toYourPerson)}
        empty={{
          title: 'Nothing sent yet',
          body: `${personFirstName} won't know it's you — notes arrive the next morning with everyone else's.`,
        }}
        action={sendAction}
      />
    </div>
  );
}
