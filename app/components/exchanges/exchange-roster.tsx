import { type ReactNode } from 'react';
import { LuCrown } from 'react-icons/lu';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { SystemLabel } from '#app/components/ui/system-label.tsx';
import { type ParticipantStatus } from '#app/utils/exchange-constants.ts';
import { type RosterEntry } from '#app/utils/exchanges.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { displayName, shortName } from './exchange-copy.ts';

// "Sitting this one out" is a third status, styled muted rather than negative.
const STATUS_LABEL: Record<ParticipantStatus, string> = {
  IN: 'In',
  PENDING: "Hasn't answered",
  OUT: 'Sitting this one out',
};

const STATUS_CLASS: Record<ParticipantStatus, string> = {
  IN: 'text-pool',
  PENDING: 'text-warning',
  OUT: 'text-muted-foreground',
};

export function ExchangeRoster({
  roster,
  viewerId,
  renderTrailing,
  className,
}: Readonly<{
  roster: RosterEntry[];
  viewerId: string;
  // Slot for a per-row action (e.g. Remind) — rendered only when it returns
  // something, so rows without an action keep their status text aligned.
  renderTrailing?: (entry: RosterEntry) => ReactNode;
  className?: string;
}>) {
  return (
    <ul
      className={cn('divide-y divide-border/60', className)}
      aria-label="Who's in"
    >
      {roster.map((entry) => {
        const isViewer = entry.user.id === viewerId;
        const trailing = renderTrailing?.(entry);
        return (
          <li
            key={entry.user.id}
            className="flex min-w-0 items-center gap-3 py-2.5"
            data-status={entry.status}
          >
            <Avatar
              size="s"
              className="!h-10 !w-10"
              image={entry.user.image}
              user={entry.user}
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold text-foreground">
                  {displayName(entry.user)}
                </span>
                {isViewer ? <SystemLabel>you</SystemLabel> : null}
                {entry.isOrganizer ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                    <LuCrown aria-hidden className="h-3 w-3" />
                    Organizer
                  </span>
                ) : null}
              </div>
            </div>
            {trailing ? (
              <div className="shrink-0">{trailing}</div>
            ) : (
              <span
                className={cn(
                  'shrink-0 text-sm font-medium',
                  STATUS_CLASS[entry.status],
                )}
              >
                {STATUS_LABEL[entry.status]}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The compact form participants see: avatars with short names, "deciding"
// people greyed at the end. No statuses beyond in/deciding — the participant
// page is deliberately thin before the draw.
export function ExchangeRosterStrip({
  roster,
  viewerId,
  className,
}: Readonly<{
  roster: RosterEntry[];
  viewerId: string;
  className?: string;
}>) {
  const inRoster = roster.filter((r) => r.status === 'IN');
  const deciding = roster.filter((r) => r.status === 'PENDING');
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}
    >
      {inRoster.map((entry) => (
        <div key={entry.user.id} className="flex items-center gap-1.5 text-sm">
          <Avatar
            size="s"
            className="!h-7 !w-7"
            image={entry.user.image}
            user={entry.user}
          />
          <span className="font-medium">
            {entry.user.id === viewerId ? 'You' : shortName(entry.user)}
          </span>
        </div>
      ))}
      {deciding.length > 0 ? (
        <span className="text-sm text-muted-foreground">
          {deciding.map((d) => shortName(d.user)).join(', ')} · deciding
        </span>
      ) : null}
    </div>
  );
}

// "5 people are in" with an avatar row — the non-participant's view.
export function ExchangeRosterAvatars({
  roster,
  className,
}: Readonly<{ roster: RosterEntry[]; className?: string }>) {
  const inRoster = roster.filter((r) => r.status === 'IN');
  return (
    <div className={cn('flex -space-x-2', className)} aria-label="People in">
      {inRoster.map((entry) => (
        <Avatar
          key={entry.user.id}
          size="s"
          className="ring-2 ring-background"
          image={entry.user.image}
          user={entry.user}
        />
      ))}
    </div>
  );
}
