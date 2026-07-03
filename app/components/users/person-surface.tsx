import { useEffect, useRef, useState } from 'react';
import {
  LuCake,
  LuCheck,
  LuClock,
  LuGift,
  LuHeart,
  LuList,
  LuMessageCircle,
  LuSparkles,
  LuUser,
  LuUsers,
  LuX,
} from 'react-icons/lu';
import { useFetcher, useNavigate } from 'react-router';
import { FriendActionButton } from '#app/components/friends/friend-action-button.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { Textarea } from '#app/components/ui/textarea.tsx';
import { type RelationshipState } from '#app/utils/friends.ts';
import { formatCents } from '#app/utils/pool-contributions.ts';

export type TemporalState =
  | 'occasion-near'
  | 'cold'
  | 'declined'
  | 'post-occasion';

type PostOccasion = {
  occasionLabel: string;
  gift: { kind: 'pool' | 'wishlist'; id: string; name: string };
  recordedGroupPoolName: string | null;
};

type Relationship = {
  state: RelationshipState;
  friendshipId: string | null;
  incomingRequestId: string | null;
  outgoingRequestId: string | null;
};

type SurfaceUser = {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  birthday: Date | string | null;
  image: { id: string } | null;
};

type OpenPool = { id: string; title: string };

export type PersonSurfaceViewData = {
  user: SurfaceUser;
  userJoinedDisplay: string;
  relationship: Relationship;
  isFriend: boolean;
  birthdayVisible: boolean;
  canViewWishlist: boolean;
  mutualGroups: Array<{ id: string; name: string }>;
  mutualFriends: Array<{
    id: string;
    username: string;
    name: string | null;
    image: { id: string } | null;
  }>;
  temporalState: TemporalState;
  occasion: { label: string; daysUntil: number } | null;
  declined: boolean;
  organizeGroups: Array<{
    id: string;
    name: string;
    memberCount: number;
    budgetCents: number;
  }>;
  budgetLine: { groupName: string; cents: number } | null;
  wishlistSource: Array<{
    id: string;
    title: string;
    url: string | null;
    priceCents: number | null;
    currency: string | null;
    claimed: boolean;
    claimedByViewer: boolean;
  }>;
  ideation: {
    giftHistory: Array<{
      id: string;
      name: string;
      year: number;
      contributorCount: number;
      priceCents: number | null;
    }>;
    proposedUnused: Array<{ id: string; name: string; year: number }>;
    notes: Array<{ id: string; body: string }>;
    savedIdeas: Array<{
      id: string;
      name: string;
      url: string | null;
      priceCents: number | null;
      currency: string | null;
    }>;
  };
  openPools: OpenPool[];
  postOccasion: PostOccasion | null;
};

const tint = (token: 'gift' | 'pool', pct: number) =>
  `hsl(var(--${token}) / ${pct})`;

function money(cents: number | null, currency: string | null) {
  if (cents == null) return null;
  return formatCents(cents, currency ?? 'USD');
}

// Close a dialog once its fetcher settles without a validation error.
function useCloseOnSuccess(
  fetcher: ReturnType<typeof useFetcher>,
  onSuccess: () => void,
) {
  const wasSubmitting = useRef(false);
  useEffect(() => {
    const submitting = fetcher.state !== 'idle';
    if (wasSubmitting.current && !submitting) {
      const data = fetcher.data as { error?: Record<string, unknown> } | null;
      const hasError = data && data.error && Object.keys(data.error).length > 0;
      if (!hasError) onSuccess();
    }
    wasSubmitting.current = submitting;
  }, [fetcher.state, fetcher.data, onSuccess]);
}

export function PersonSurface(data: PersonSurfaceViewData) {
  const displayName = data.user.name ?? data.user.username;
  const isOccasionNear = data.temporalState === 'occasion-near';
  const isDeclined = data.temporalState === 'declined';

  if (data.temporalState === 'post-occasion' && data.postOccasion) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:py-10">
        <PostOccasionFlow
          user={data.user}
          displayName={displayName}
          postOccasion={data.postOccasion}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:py-10">
      {isDeclined ? (
        <DeclinedHeader
          user={data.user}
          displayName={displayName}
          occasionLabel={data.occasion?.label ?? null}
        />
      ) : isOccasionNear ? (
        <OccasionHeader
          user={data.user}
          displayName={displayName}
          occasion={data.occasion}
        />
      ) : (
        <IdentityHeader data={data} displayName={displayName} />
      )}

      {isOccasionNear ? (
        <ActionRow data={data} displayName={displayName} />
      ) : null}

      <div
        className={isDeclined ? 'pointer-events-none opacity-50' : undefined}
      >
        <IdeationBlock data={data} displayName={displayName} />
      </div>
    </div>
  );
}

// ─── Headers ────────────────────────────────────────────────────────────────

function OccasionHeader({
  user,
  displayName,
  occasion,
}: {
  user: SurfaceUser;
  displayName: string;
  occasion: { label: string; daysUntil: number } | null;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border p-5"
      style={{
        borderColor: tint('gift', 0.22),
        background: `linear-gradient(150deg, ${tint('gift', 0.14)}, ${tint('gift', 0.05)} 62%, hsl(var(--card)))`,
      }}
    >
      <div className="flex items-center gap-3.5">
        <Avatar
          image={user.image ? { ...user.image, altText: null } : null}
          user={user}
          size={14}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-extrabold leading-tight tracking-tight">
            {displayName}
          </div>
          <div className="mt-0.5 text-sm font-semibold text-muted-foreground">
            @{user.username}
          </div>
        </div>
      </div>
      {occasion ? (
        <div className="mt-4 flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-gift"
            style={{ background: tint('gift', 0.16) }}
          >
            <LuCake size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold leading-tight">
              Birthday · {occasion.label}
            </div>
            <div className="mt-px text-xs font-bold text-gift">
              {countdownLabel(occasion.daysUntil)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeclinedHeader({
  user,
  displayName,
  occasionLabel,
}: {
  user: SurfaceUser;
  displayName: string;
  occasionLabel: string | null;
}) {
  const fetcher = useFetcher();
  return (
    <div className="rounded-3xl border bg-muted/60 p-4">
      <div className="flex items-center gap-3.5">
        <span className="opacity-75">
          <Avatar
            image={user.image ? { ...user.image, altText: null } : null}
            user={user}
            size={12}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-extrabold">{displayName}</div>
          {occasionLabel ? (
            <div className="mt-px text-xs font-semibold text-muted-foreground">
              Birthday · {occasionLabel}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2.5 border-t pt-4">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <LuX size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold">
            You're sitting this one out
          </div>
          <div className="mt-px text-xs font-bold text-muted-foreground">
            Only you can see this
          </div>
        </div>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="undo-decline" />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={fetcher.state !== 'idle'}
          >
            Undo
          </Button>
        </fetcher.Form>
      </div>
    </div>
  );
}

function IdentityHeader({
  data,
  displayName,
}: {
  data: PersonSurfaceViewData;
  displayName: string;
}) {
  const facts: Array<{ icon: React.ReactNode; label: string }> = [];
  if (data.birthdayVisible && data.occasion) {
    facts.push({ icon: <LuCake size={14} />, label: data.occasion.label });
  }
  if (data.mutualGroups.length > 0) {
    facts.push({
      icon: <LuUsers size={14} />,
      label: `${data.mutualGroups.length} shared ${data.mutualGroups.length === 1 ? 'group' : 'groups'}`,
    });
  }
  if (data.mutualFriends.length > 0) {
    facts.push({
      icon: <LuHeart size={14} />,
      label: `${data.mutualFriends.length} mutual ${data.mutualFriends.length === 1 ? 'friend' : 'friends'}`,
    });
  }

  return (
    <div className="flex flex-col items-center py-2 text-center">
      <Avatar
        image={data.user.image ? { ...data.user.image, altText: null } : null}
        user={data.user}
        size={20}
      />
      <div className="mt-3 text-xl font-extrabold tracking-tight">
        {displayName}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-muted-foreground">
        @{data.user.username}
      </div>
      {facts.length > 0 ? (
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          {facts.map((f) => (
            <span
              key={f.label}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-bold"
            >
              {f.icon}
              {f.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4">
        <FriendActionButton
          targetUserId={data.user.id}
          targetUserName={displayName}
          relationship={data.relationship}
          variant="compact"
        />
      </div>
    </div>
  );
}

function countdownLabel(daysUntil: number) {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil < 14) return `in ${daysUntil} days`;
  const weeks = Math.round(daysUntil / 7);
  return `in ${weeks} weeks`;
}

// ─── Action row ───────────────────────────────────────────────────────────────

function ActionRow({
  data,
  displayName,
}: {
  data: PersonSurfaceViewData;
  displayName: string;
}) {
  return (
    <div>
      <OrganizeButton recipientId={data.user.id} groups={data.organizeGroups} />
      <div className="mt-2.5 flex gap-2">
        <SoloCommitDialog
          displayName={displayName}
          trigger={
            <SecondaryAction icon={<LuUser size={18} />} label="Just me" />
          }
        />
        <SaveIdeaDialog
          displayName={displayName}
          trigger={
            <SecondaryAction icon={<LuHeart size={18} />} label="Save idea" />
          }
        />
        <DeclineButton />
      </div>
    </div>
  );
}

function OrganizeButton({
  recipientId,
  groups,
}: {
  recipientId: string;
  groups: PersonSurfaceViewData['organizeGroups'];
}) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  const goStandalone = () => navigate(`/pools/new?recipientId=${recipientId}`);
  const goGroup = (groupId: string) =>
    navigate(`/pools/new?groupId=${groupId}&recipientId=${recipientId}`);

  const primary = (onClick: () => void, label: string) => (
    <Button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-full bg-gift text-base font-extrabold text-white hover:bg-gift/90"
    >
      <LuGift size={20} className="mr-2" />
      {label}
    </Button>
  );

  if (groups.length === 0) {
    return primary(goStandalone, 'Organize a gift');
  }
  if (groups.length === 1) {
    return primary(
      () => goGroup(groups[0]!.id),
      `Organize with ${groups[0]!.name}`,
    );
  }

  return (
    <>
      {primary(() => setPickerOpen(true), 'Organize a gift')}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organize with which circle?</DialogTitle>
            <DialogDescription>
              Your call, every time — we never pick for you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2.5">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => goGroup(g.id)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition-colors hover:border-gift/50"
              >
                <span
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gift"
                  style={{ background: tint('gift', 0.12) }}
                >
                  <LuUsers size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold">{g.name}</div>
                  <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                    {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                    {g.budgetCents > 0
                      ? ` · can cover ~$${Math.round(g.budgetCents / 100)}`
                      : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SecondaryAction({
  icon,
  label,
  onClick,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl border bg-card px-1 py-3 text-xs font-bold transition-colors hover:bg-accent ${muted ? 'text-muted-foreground' : ''}`}
    >
      {icon}
      {label}
    </button>
  );
}

function DeclineButton() {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" className="flex flex-1">
      <input type="hidden" name="intent" value="decline-occasion" />
      <button
        type="submit"
        disabled={fetcher.state !== 'idle'}
        className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl border bg-card px-1 py-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
      >
        <LuX size={18} />
        Not this time
      </button>
    </fetcher.Form>
  );
}

// ─── Reusable mutation dialogs ─────────────────────────────────────────────────

function TriggerButton({
  trigger,
  onClick,
}: {
  trigger: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <span onClick={onClick} className="contents">
      {trigger}
    </span>
  );
}

function SaveIdeaDialog({
  displayName,
  trigger,
}: {
  displayName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  useCloseOnSuccess(fetcher, () => setOpen(false));
  return (
    <>
      <TriggerButton trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="save-idea" />
            <DialogHeader>
              <DialogTitle>Save an idea for {displayName}</DialogTitle>
              <DialogDescription>
                Private to you — pull it up when an occasion arrives.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="idea-name">Idea</Label>
                <Input
                  id="idea-name"
                  name="name"
                  required
                  maxLength={200}
                  placeholder="e.g. Ceramics class"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="idea-url">
                  Link <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="idea-url"
                  name="url"
                  type="url"
                  placeholder="https://…"
                />
              </div>
            </div>
            <DialogFooter className="mt-5 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fetcher.state !== 'idle'}>
                Save idea
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddNoteDialog({
  displayName,
  trigger,
}: {
  displayName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  useCloseOnSuccess(fetcher, () => setOpen(false));
  return (
    <>
      <TriggerButton trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="add-note" />
            <DialogHeader>
              <DialogTitle>Add a note about {displayName}</DialogTitle>
              <DialogDescription>
                Private to you — never visible to {displayName}.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="note-body">Note</Label>
              <Textarea
                id="note-body"
                name="body"
                required
                maxLength={1000}
                rows={3}
                placeholder="e.g. Started running this spring — needs real gear."
                autoFocus
              />
            </div>
            <DialogFooter className="mt-5 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fetcher.state !== 'idle'}>
                Add note
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SoloCommitDialog({
  displayName,
  trigger,
  defaultName = '',
}: {
  displayName: string;
  trigger: React.ReactNode;
  defaultName?: string;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  useCloseOnSuccess(fetcher, () => setOpen(false));
  return (
    <>
      <TriggerButton trigger={trigger} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="solo-commit" />
            <DialogHeader>
              <DialogTitle>I've got this one</DialogTitle>
              <DialogDescription>
                A private gift, just from you — {displayName} never sees it.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="solo-name">What are you getting them?</Label>
              <Input
                id="solo-name"
                name="name"
                required
                maxLength={200}
                defaultValue={defaultName}
                placeholder="e.g. Trail running shoes"
                autoFocus
              />
            </div>
            <DialogFooter className="mt-5 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fetcher.state !== 'idle'}>
                I've got this
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Ideation block (§7) ───────────────────────────────────────────────────────

function SectionHeading({
  icon,
  token,
  title,
  right,
}: {
  icon: React.ReactNode;
  token: 'gift' | 'pool';
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 mt-2 flex items-center gap-2.5">
      <span
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${token === 'gift' ? 'text-gift' : 'text-pool'}`}
        style={{ background: tint(token, 0.12) }}
      >
        {icon}
      </span>
      <h2 className="flex-1 text-base font-extrabold">{title}</h2>
      {right}
    </div>
  );
}

function IdeationBlock({
  data,
  displayName,
}: {
  data: PersonSurfaceViewData;
  displayName: string;
}) {
  const { ideation } = data;
  const hasMemory =
    ideation.giftHistory.length > 0 ||
    ideation.proposedUnused.length > 0 ||
    ideation.notes.length > 0 ||
    ideation.savedIdeas.length > 0;
  const showWishlist = data.canViewWishlist && data.wishlistSource.length > 0;
  const isOccasionNear = data.temporalState === 'occasion-near';

  const isCold = data.temporalState === 'cold';

  return (
    <div className="flex flex-col">
      {isCold ? <ColdCapture displayName={displayName} /> : null}

      {isOccasionNear ? (
        <div className="mb-1 mt-4 px-0.5">
          <div className="text-lg font-extrabold tracking-tight">
            What should we get them?
          </div>
          <div className="mt-0.5 text-sm font-semibold text-muted-foreground">
            Everything this circle knows about {displayName} — in one place.
          </div>
        </div>
      ) : null}

      {showWishlist ? (
        <section>
          <SectionHeading
            icon={<LuList size={16} />}
            token="gift"
            title="Their wishlist"
            right={
              <span className="text-[11px] font-bold text-muted-foreground">
                {data.wishlistSource.length} items
              </span>
            }
          />
          <div className="flex flex-col gap-2.5">
            {data.wishlistSource.map((item) => (
              <WishlistSourceRow
                key={item.id}
                item={item}
                recipientId={data.user.id}
                openPools={data.openPools}
              />
            ))}
          </div>
        </section>
      ) : null}

      {ideation.giftHistory.length > 0 ? (
        <section>
          <SectionHeading
            icon={<LuClock size={16} />}
            token="pool"
            title="What this circle gave before"
          />
          <div className="rounded-2xl border bg-card px-3.5 py-1">
            {ideation.giftHistory.map((g, i) => (
              <div
                key={g.id}
                className={`flex items-center gap-2.5 py-2.5 ${i > 0 ? 'border-t' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{g.name}</div>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {g.year} · pooled by {g.contributorCount}
                  </div>
                </div>
                {g.priceCents != null ? (
                  <div className="flex-none text-[13px] font-extrabold text-pool">
                    {formatCents(g.priceCents)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {ideation.proposedUnused.length > 0 ? (
        <section>
          <SectionHeading
            icon={<LuSparkles size={16} />}
            token="gift"
            title="We almost got them…"
          />
          <div className="flex flex-wrap gap-2">
            {ideation.proposedUnused.map((idea) => (
              <span
                key={idea.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-2 text-[13px] font-bold"
              >
                {idea.name}
                <span className="text-[11px] font-semibold text-muted-foreground">
                  '{String(idea.year).slice(2)}
                </span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {ideation.notes.length > 0 ? (
        <section>
          <SectionHeading
            icon={<LuMessageCircle size={16} />}
            token="pool"
            title="Your notes · private"
            right={
              <AddNoteDialog
                displayName={displayName}
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5 text-xs font-bold"
                  >
                    Add
                  </button>
                }
              />
            }
          />
          <div className="flex flex-col gap-2">
            {ideation.notes.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border bg-card px-3.5 py-3 text-[13px] font-semibold leading-relaxed"
              >
                {note.body}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {ideation.savedIdeas.length > 0 ? (
        <section>
          <SectionHeading
            icon={<LuHeart size={16} />}
            token="gift"
            title="Your saved ideas · private"
          />
          <div className="flex flex-col gap-2">
            {ideation.savedIdeas.map((idea) => (
              <div
                key={idea.id}
                className="flex items-center gap-2.5 rounded-2xl border bg-card px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{idea.name}</div>
                  {money(idea.priceCents, idea.currency) ? (
                    <div className="text-xs font-semibold text-muted-foreground">
                      {money(idea.priceCents, idea.currency)}
                    </div>
                  ) : null}
                </div>
                <ProposeControl
                  recipientId={data.user.id}
                  openPools={data.openPools}
                  name={idea.name}
                  giftListItemId={idea.id}
                  url={idea.url}
                  priceCents={idea.priceCents}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.budgetLine ? (
        <div
          className="mt-5 flex items-center gap-2.5 rounded-2xl border p-3.5"
          style={{
            background: tint('pool', 0.08),
            borderColor: tint('pool', 0.18),
          }}
        >
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-pool"
            style={{ background: tint('pool', 0.16) }}
          >
            <LuUsers size={16} />
          </span>
          <div className="text-[13px] font-semibold leading-snug">
            {data.budgetLine.groupName} can cover{' '}
            <strong className="font-extrabold text-pool">
              ~${Math.round(data.budgetLine.cents / 100)}
            </strong>{' '}
            together.
          </div>
        </div>
      ) : null}

      {isOccasionNear && !hasMemory ? (
        <DayOneCapture displayName={displayName} />
      ) : null}
    </div>
  );
}

// Cold-state year-round capture — the prominent "save an idea / add a note"
// habit (mock 1b), shown above the wishlist.
function ColdCapture({ displayName }: { displayName: string }) {
  return (
    <div className="mb-2 mt-3 flex gap-2.5">
      <SaveIdeaDialog
        displayName={displayName}
        trigger={
          <button
            type="button"
            className="flex flex-1 flex-col gap-2.5 rounded-2xl bg-gift p-4 text-left text-white"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
              <LuHeart size={18} />
            </span>
            <span>
              <span className="block text-sm font-extrabold">Save an idea</span>
              <span className="mt-0.5 block text-[11px] font-semibold opacity-85">
                for when it counts
              </span>
            </span>
          </button>
        }
      />
      <AddNoteDialog
        displayName={displayName}
        trigger={
          <button
            type="button"
            className="flex flex-1 flex-col gap-2.5 rounded-2xl border bg-card p-4 text-left"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl text-pool"
              style={{ background: tint('pool', 0.13) }}
            >
              <LuMessageCircle size={18} />
            </span>
            <span>
              <span className="block text-sm font-extrabold">Add a note</span>
              <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">
                something you noticed
              </span>
            </span>
          </button>
        }
      />
    </div>
  );
}

function WishlistSourceRow({
  item,
  recipientId,
  openPools,
}: {
  item: PersonSurfaceViewData['wishlistSource'][number];
  recipientId: string;
  openPools: OpenPool[];
}) {
  const claimFetcher = useFetcher();
  const price = money(item.priceCents, item.currency);

  if (item.claimed && !item.claimedByViewer) {
    return (
      <div className="rounded-2xl border bg-muted/50 p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-muted-foreground line-through">
              {item.title}
            </div>
            {price ? (
              <div className="text-[13px] font-semibold text-muted-foreground">
                {price}
              </div>
            ) : null}
          </div>
          <span className="inline-flex h-[22px] flex-none items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] font-extrabold text-muted-foreground">
            <LuCheck size={12} />
            Spoken for
          </span>
        </div>
        <div className="mt-2 text-[11.5px] font-semibold text-muted-foreground">
          Someone's already covering this one.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{item.title}</div>
          {price ? (
            <div className="mt-0.5 text-[13px] font-extrabold text-pool">
              {price}
            </div>
          ) : null}
        </div>
        {item.claimedByViewer ? (
          <span className="inline-flex h-[22px] flex-none items-center gap-1 rounded-full bg-gift/15 px-2.5 text-[11px] font-extrabold text-gift">
            <LuCheck size={12} />
            You're getting this
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex gap-2">
        <claimFetcher.Form
          method="post"
          action="/wishlist/purchase"
          className="flex-1"
        >
          <input
            type="hidden"
            name="intent"
            value={item.claimedByViewer ? 'unpurchase' : 'purchase'}
          />
          <input type="hidden" name="wishlistItemId" value={item.id} />
          <button
            type="submit"
            disabled={claimFetcher.state !== 'idle'}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border text-[12.5px] font-bold transition-colors hover:bg-accent"
          >
            <LuCheck size={15} />
            {item.claimedByViewer ? "I'm not, actually" : "I'm getting this"}
          </button>
        </claimFetcher.Form>
        {!item.claimedByViewer ? (
          <ProposeControl
            recipientId={recipientId}
            openPools={openPools}
            name={item.title}
            wishlistItemId={item.id}
            url={item.url}
            priceCents={item.priceCents}
            variant="wishlist"
          />
        ) : null}
      </div>
    </div>
  );
}

// Propose an idea into a pool. 0 open pools → Organize (create a pool); 1 →
// propose directly; 2+ → pick a pool. Never dead-ends.
function ProposeControl({
  recipientId,
  openPools,
  name,
  wishlistItemId,
  giftListItemId,
  url,
  priceCents,
  variant = 'saved',
}: {
  recipientId: string;
  openPools: OpenPool[];
  name: string;
  wishlistItemId?: string;
  giftListItemId?: string;
  url?: string | null;
  priceCents?: number | null;
  variant?: 'wishlist' | 'saved';
}) {
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [pickerOpen, setPickerOpen] = useState(false);

  const hidden = (poolId: string) => (
    <>
      <input type="hidden" name="intent" value="propose-to-pool" />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="name" value={name} />
      {wishlistItemId ? (
        <input type="hidden" name="wishlistItemId" value={wishlistItemId} />
      ) : null}
      {giftListItemId ? (
        <input type="hidden" name="giftListItemId" value={giftListItemId} />
      ) : null}
      {url ? <input type="hidden" name="url" value={url} /> : null}
      {priceCents != null ? (
        <input type="hidden" name="priceCents" value={priceCents / 100} />
      ) : null}
    </>
  );

  const btnClass =
    variant === 'wishlist'
      ? 'inline-flex h-9 w-full flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-extrabold text-pool'
      : 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold text-pool';
  const btnStyle = { background: tint('pool', 0.12) };

  // 0 open pools → route into Organize (the idea seeds the new pool's title).
  if (openPools.length === 0) {
    return (
      <button
        type="button"
        onClick={() =>
          navigate(
            `/pools/new?recipientId=${recipientId}&title=${encodeURIComponent(name)}`,
          )
        }
        className={btnClass}
        style={btnStyle}
      >
        <LuUsers size={15} />
        Propose to pool
      </button>
    );
  }

  // 1 open pool → propose directly.
  if (openPools.length === 1) {
    return (
      <fetcher.Form
        method="post"
        className={variant === 'wishlist' ? 'flex-1' : undefined}
      >
        {hidden(openPools[0]!.id)}
        <button
          type="submit"
          disabled={fetcher.state !== 'idle'}
          className={btnClass}
          style={btnStyle}
        >
          <LuUsers size={15} />
          Propose to pool
        </button>
      </fetcher.Form>
    );
  }

  // 2+ open pools → pick which one.
  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className={btnClass}
        style={btnStyle}
      >
        <LuUsers size={15} />
        Propose to pool
      </button>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose to which pool?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {openPools.map((pool) => (
              <fetcher.Form key={pool.id} method="post">
                {hidden(pool.id)}
                <button
                  type="submit"
                  onClick={() => setPickerOpen(false)}
                  className="flex w-full items-center justify-between rounded-2xl border bg-card p-3.5 text-left font-bold transition-colors hover:border-pool/50"
                >
                  {pool.title}
                </button>
              </fetcher.Form>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Post-occasion memory write (§4, mock 1c) ─────────────────────────────────

function PostOccasionFlow({
  user,
  displayName,
  postOccasion,
}: {
  user: SurfaceUser;
  displayName: string;
  postOccasion: PostOccasion;
}) {
  const fetcher = useFetcher();
  const { gift } = postOccasion;

  const feedbackForm = (feedback: 'LOVED' | 'OKAY' | 'SKIPPED') => (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="record-outcome" />
      <input type="hidden" name="kind" value={gift.kind} />
      <input
        type="hidden"
        name={gift.kind === 'pool' ? 'poolId' : 'wishlistItemId'}
        value={gift.id}
      />
      <input type="hidden" name="feedback" value={feedback} />
      {feedback === 'LOVED' ? (
        <button
          type="submit"
          disabled={fetcher.state !== 'idle'}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-gift text-[13px] font-extrabold text-white hover:bg-gift/90"
        >
          <LuHeart size={15} />
          They loved it
        </button>
      ) : feedback === 'OKAY' ? (
        <button
          type="submit"
          disabled={fetcher.state !== 'idle'}
          className="inline-flex h-10 items-center justify-center rounded-full border px-4 text-[13px] font-bold hover:bg-accent"
        >
          It was okay
        </button>
      ) : (
        <button
          type="submit"
          disabled={fetcher.state !== 'idle'}
          className="h-9 rounded-full px-4 text-[13px] font-bold text-muted-foreground hover:text-foreground"
        >
          Skip for now
        </button>
      )}
    </fetcher.Form>
  );

  return (
    <>
      {/* quiet header */}
      <div className="flex items-center gap-3.5 px-0.5 pt-1">
        <Avatar
          image={user.image ? { ...user.image, altText: null } : null}
          user={user}
          size={12}
        />
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold">
            {displayName}'s birthday
          </div>
          <div className="mt-px text-xs font-semibold text-muted-foreground">
            {postOccasion.occasionLabel}
          </div>
        </div>
      </div>

      <div className="mb-1 mt-3 px-0.5">
        <div className="text-lg font-extrabold tracking-tight">
          How did it go?
        </div>
        <div className="mt-0.5 text-sm font-semibold text-muted-foreground">
          Just one thing to confirm — then this rests.
        </div>
      </div>

      {/* solo gift confirm */}
      <div className="rounded-3xl border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-gift"
            style={{ background: tint('gift', 0.12) }}
          >
            <LuUser size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold">
              Your gift · {gift.name}
            </div>
            <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
              You had this one covered on your own.
            </div>
          </div>
        </div>
        <div className="mb-2.5 mt-4 text-[13.5px] font-bold">Did it land?</div>
        <div className="flex gap-2">
          <div className="flex-1">{feedbackForm('LOVED')}</div>
          {feedbackForm('OKAY')}
        </div>
      </div>

      {/* group pool recorded automatically */}
      {postOccasion.recordedGroupPoolName ? (
        <div
          className="flex items-center gap-2.5 rounded-2xl border p-3.5"
          style={{
            background: tint('pool', 0.08),
            borderColor: tint('pool', 0.18),
          }}
        >
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-pool"
            style={{ background: tint('pool', 0.16) }}
          >
            <LuCheck size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-extrabold">
              The circle's pool — recorded
            </div>
            <div className="mt-px text-xs font-semibold text-muted-foreground">
              {postOccasion.recordedGroupPoolName} · saved to memory
              automatically
            </div>
          </div>
        </div>
      ) : null}

      {/* skippable — never re-nagged */}
      <div className="mt-2 text-center">{feedbackForm('SKIPPED')}</div>
    </>
  );
}

function DayOneCapture({ displayName }: { displayName: string }) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed p-5 text-center">
      <span
        className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl text-pool"
        style={{ background: tint('pool', 0.1) }}
      >
        <LuSparkles size={22} />
      </span>
      <div className="text-[15px] font-extrabold">Start the memory</div>
      <div className="mx-auto mb-4 mt-1 max-w-xs text-[12.5px] font-semibold leading-relaxed text-muted-foreground">
        Notes and gift history fill in as your circle uses them. Nothing to see
        yet — and that's fine.
      </div>
      <div className="flex gap-2">
        <SaveIdeaDialog
          displayName={displayName}
          trigger={
            <button
              type="button"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-gift text-[13px] font-extrabold text-white"
            >
              <LuHeart size={15} />
              Save an idea
            </button>
          }
        />
        <AddNoteDialog
          displayName={displayName}
          trigger={
            <button
              type="button"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border text-[13px] font-bold"
            >
              <LuMessageCircle size={15} />
              Add a note
            </button>
          }
        />
      </div>
    </div>
  );
}
