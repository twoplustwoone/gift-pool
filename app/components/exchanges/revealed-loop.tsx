import { LuArrowRight, LuCornerLeftUp } from 'react-icons/lu';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Section } from '#app/components/ui/section.tsx';
import { SystemLabel } from '#app/components/ui/system-label.tsx';
import {
  GIFT_OUTCOME_LABELS,
  type GiftOutcome,
} from '#app/utils/exchange-constants.ts';
import {
  type ExchangePerson,
  type RevealedPair,
} from '#app/utils/exchanges.server.ts';
import { displayName } from './exchange-copy.ts';

function giftLine(pair: RevealedPair): string {
  if (!pair.giftLabel) return "didn't say what they gave";
  const outcome = pair.outcome
    ? ` · ${GIFT_OUTCOME_LABELS[pair.outcome as GiftOutcome]}`
    : '';
  return `gave ${pair.giftLabel}${outcome}`;
}

// The loop. On mobile a vertical chain that ends with a dashed return to the
// top; on desktop a ring diagram (decoration with meaning) above a table (the
// record). Every node carries a name — avatars alone are never the label. A
// missing gift is stated plainly rather than hidden.
export function RevealedLoop({
  loop,
  viewerId,
  onAddGiftLabel,
  canAddGiftLabel,
}: Readonly<{
  loop: RevealedPair[];
  viewerId: string;
  canAddGiftLabel: boolean;
  onAddGiftLabel?: () => void;
}>) {
  const nobodyLogged = loop.every((p) => !p.giftLabel);
  const first = loop[0];
  return (
    <Section title="The loop" data-testid="revealed-loop">
      {/* Mobile: chain */}
      <ol className="space-y-0 sm:hidden" aria-label="Who gave to whom">
        {loop.map((pair, i) => (
          <li key={pair.gifter.id} className="relative flex gap-3 pb-5">
            {i < loop.length - 1 ? (
              <span
                aria-hidden
                className="absolute left-5 top-10 h-[calc(100%-2.5rem)] w-px bg-pool/40"
              />
            ) : null}
            <Avatar
              size="s"
              className="!h-10 !w-10 shrink-0"
              image={pair.gifter.image}
              user={pair.gifter}
            />
            <div className="min-w-0 flex-1 pt-1">
              <p className="flex items-center gap-2 font-semibold leading-tight">
                <span className="truncate">{displayName(pair.gifter)}</span>
                {pair.gifter.id === viewerId ? (
                  <SystemLabel>you</SystemLabel>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">{giftLine(pair)}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <LuArrowRight aria-hidden className="h-3 w-3" />
                to {displayName(pair.giftee)}
              </p>
            </div>
          </li>
        ))}
        {first ? (
          <li className="flex items-center gap-2 border-t border-dashed border-pool/40 pt-3 text-xs text-muted-foreground">
            <LuCornerLeftUp aria-hidden className="h-3.5 w-3.5" />
            back to {displayName(first.gifter)}
          </li>
        ) : null}
      </ol>

      {/* Desktop: ring + table */}
      <div className="hidden sm:block">
        <Ring loop={loop} viewerId={viewerId} />
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">
            Each person gave to the next one round
          </caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 font-medium">
                Gave
              </th>
              <th scope="col" className="py-1 font-medium">
                To
              </th>
              <th scope="col" className="py-1 font-medium">
                What
              </th>
            </tr>
          </thead>
          <tbody>
            {loop.map((pair) => (
              <tr key={pair.gifter.id} className="border-t border-border/60">
                <td className="py-2 font-medium">
                  {displayName(pair.gifter)}
                  {pair.gifter.id === viewerId ? (
                    <>
                      {' '}
                      <SystemLabel>you</SystemLabel>
                    </>
                  ) : null}
                </td>
                <td className="py-2">{displayName(pair.giftee)}</td>
                <td className="py-2 text-muted-foreground">{giftLine(pair)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nobodyLogged ? (
        <div className="mt-4 rounded-lg border border-dashed p-3 text-sm">
          <p className="font-medium">Nobody wrote down what they gave</p>
          <p className="text-muted-foreground">
            You can still add yours. It's what makes next year's page worth
            opening.
          </p>
          {canAddGiftLabel && onAddGiftLabel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={onAddGiftLabel}
            >
              Add what you gave
            </Button>
          ) : null}
        </div>
      ) : canAddGiftLabel &&
        onAddGiftLabel &&
        !loop.find((p) => p.gifter.id === viewerId)?.giftLabel ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={onAddGiftLabel}
        >
          Add what you gave
        </Button>
      ) : null}
    </Section>
  );
}

// A circle of avatars with names, laid out with plain trigonometry. One
// consumer, one topology; kept local rather than shared.
function Ring({ loop, viewerId }: { loop: RevealedPair[]; viewerId: string }) {
  const n = loop.length;
  const size = 320;
  const radius = 120;
  const center = size / 2;
  const nodes = loop.map((pair, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      person: pair.gifter,
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  });
  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} className="absolute inset-0">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-pool/40"
          strokeDasharray="4 6"
          strokeWidth={2}
        />
        {nodes.map((node, i) => {
          const next = nodes[(i + 1) % n]!;
          const dx = next.x - node.x;
          const dy = next.y - node.y;
          const len = Math.hypot(dx, dy) || 1;
          const ax = next.x - (dx / len) * 26;
          const ay = next.y - (dy / len) * 26;
          return (
            <line
              key={node.person.id}
              x1={node.x + (dx / len) * 26}
              y1={node.y + (dy / len) * 26}
              x2={ax}
              y2={ay}
              className="stroke-pool"
              strokeWidth={1.5}
              markerEnd="url(#exchange-arrow)"
            />
          );
        })}
        <defs>
          <marker
            id="exchange-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-pool" />
          </marker>
        </defs>
      </svg>
      {nodes.map((node) => (
        <RingNode
          key={node.person.id}
          person={node.person}
          x={node.x}
          y={node.y}
          isViewer={node.person.id === viewerId}
        />
      ))}
    </div>
  );
}

function RingNode({
  person,
  x,
  y,
  isViewer,
}: {
  person: ExchangePerson;
  x: number;
  y: number;
  isViewer: boolean;
}) {
  return (
    <div
      className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center"
      style={{ left: x, top: y }}
    >
      <Avatar
        size="s"
        className="!h-10 !w-10 ring-2 ring-background"
        image={person.image}
        user={person}
      />
      <span className="text-[11px] font-semibold leading-tight">
        {displayName(person)}
        {isViewer ? ' (you)' : ''}
      </span>
    </div>
  );
}
