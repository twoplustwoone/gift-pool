import { useEffect, useRef, useState } from 'react';
import {
  LuCake,
  LuGift,
  LuHeart,
  LuMessageCircle,
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
import { MutualStrip } from '#app/components/users/mutual-strip.tsx';
import { WishlistPreviewCard } from '#app/components/users/wishlist-preview-card.tsx';
import { type RelationshipState } from '#app/utils/friends.ts';

export type TemporalState = 'occasion-near' | 'cold' | 'declined';

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
  wishlistPreview: {
    totalCount: number;
    items: Array<{
      id: string;
      title: string;
      hasImage: boolean;
      url: string | null;
      updatedAt: Date | string;
    }>;
  };
  temporalState: TemporalState;
  occasion: { label: string; daysUntil: number } | null;
  declined: boolean;
  organizeGroups: Array<{
    id: string;
    name: string;
    memberCount: number;
    budgetCents: number;
  }>;
};

const tint = (token: 'gift' | 'pool', pct: number) =>
  `hsl(var(--${token}) / ${pct})`;

function formatBudget(cents: number) {
  return `~$${Math.round(cents / 100)}`;
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

      {!isOccasionNear && !isDeclined ? (
        <CaptureCard displayName={displayName} />
      ) : null}

      {/* Ideation body — the full circle-private block lands in commit 4. */}
      <div
        className={isDeclined ? 'pointer-events-none opacity-50' : undefined}
      >
        <div className="flex flex-col gap-6">
          <MutualStrip
            groups={data.mutualGroups}
            friends={data.mutualFriends}
          />
          {data.canViewWishlist ? (
            <WishlistPreviewCard
              items={data.wishlistPreview.items}
              totalCount={data.wishlistPreview.totalCount}
              fullListTo="wishlist"
              ownerName={displayName}
            />
          ) : null}
        </div>
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
        <SoloCommitButton displayName={displayName} />
        <SaveIdeaButton displayName={displayName} />
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
                      ? ` · can cover ${formatBudget(g.budgetCents)}`
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
  onClick: () => void;
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

function SoloCommitButton({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  useCloseOnSuccess(fetcher, () => setOpen(false));
  return (
    <>
      <SecondaryAction
        icon={<LuUser size={18} />}
        label="Just me"
        onClick={() => setOpen(true)}
      />
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

function SaveIdeaButton({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  useCloseOnSuccess(fetcher, () => setOpen(false));
  return (
    <>
      <SecondaryAction
        icon={<LuHeart size={18} />}
        label="Save idea"
        onClick={() => setOpen(true)}
      />
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

// ─── Capture card (cold / day-one) ────────────────────────────────────────────

function CaptureCard({ displayName }: { displayName: string }) {
  return (
    <div className="flex gap-2.5">
      <SaveIdeaCapture displayName={displayName} />
      <AddNoteCapture displayName={displayName} />
    </div>
  );
}

function SaveIdeaCapture({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  useCloseOnSuccess(fetcher, () => setOpen(false));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 flex-col gap-2.5 rounded-2xl border-none bg-gift p-4 text-left text-white"
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
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="capture-idea-name">Idea</Label>
              <Input
                id="capture-idea-name"
                name="name"
                required
                maxLength={200}
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
                Save idea
              </Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddNoteCapture({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  useCloseOnSuccess(fetcher, () => setOpen(false));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
