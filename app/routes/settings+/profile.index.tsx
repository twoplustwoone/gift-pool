import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { useCallback, useState } from 'react';
import {
  data as rrData,
  Link,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import {
  EditableSection,
  ReadField,
  useExitOnSubmitSuccess,
} from '#app/components/editable-section.tsx';
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { requireUserId, sessionKey } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  announceExchangeAccountDeletion,
  prepareExchangesForAccountDeletion,
} from '#app/utils/exchanges.server.ts';
import { useDoubleCheck } from '#app/utils/misc.tsx';
import { queueWishlistClaimTransferredNotification } from '#app/utils/pool.server.ts';
import { authSessionStorage } from '#app/utils/session.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';
import {
  BIO_MAX_LENGTH,
  BioSchema,
  BirthdaySchema,
  BirthdayVisibilitySchema,
  NameSchema,
  UsernameSchema,
  WishlistVisibilitySchema,
  type BirthdayVisibility,
  type WishlistVisibility,
} from '#app/utils/user-validation.ts';
import { releaseSoloClaimsMatching } from '#app/utils/wishlist-claims.server.ts';
import { DangerZoneDeleteDialog } from './__danger-zone-delete-dialog.tsx';
import { ProfilePhotoSheet } from './__profile-photo-sheet.tsx';
import { twoFAVerificationType } from './profile.two-factor.tsx';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

const ProfileFormSchema = z.object({
  name: NameSchema.optional(),
  username: UsernameSchema,
  bio: BioSchema.optional(),
  birthday: BirthdaySchema.optional(),
});

const PrivacyFormSchema = z.object({
  birthdayVisibility: BirthdayVisibilitySchema,
  wishlistVisibility: WishlistVisibilitySchema,
});

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      bio: true,
      birthday: true,
      birthdayVisibility: true,
      wishlistVisibility: true,
      image: { select: { id: true } },
      _count: {
        select: {
          sessions: {
            where: { expirationDate: { gt: new Date() } },
          },
        },
      },
    },
  });
  const twoFactorVerification = await prisma.verification.findUnique({
    select: { id: true },
    where: {
      target_type: {
        type: twoFAVerificationType,
        target: userId,
      },
    },
  });
  const password = await prisma.password.findUnique({
    select: { userId: true },
    where: { userId },
  });
  return {
    user,
    hasPassword: Boolean(password),
    isTwoFactorEnabled: Boolean(twoFactorVerification),
  };
}

type ProfileActionArgs = {
  request: Request;
  userId: string;
  formData: FormData;
};

const profileUpdateActionIntent = 'update-profile';
const privacyUpdateActionIntent = 'update-privacy';
const signOutOfSessionsActionIntent = 'sign-out-of-sessions';
const deleteDataActionIntent = 'delete-data';

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  switch (intent) {
    case profileUpdateActionIntent: {
      return profileUpdateAction({ request, userId, formData });
    }
    case privacyUpdateActionIntent: {
      return privacyUpdateAction({ request, userId, formData });
    }
    case signOutOfSessionsActionIntent: {
      return signOutOfSessionsAction({ request, userId, formData });
    }
    case deleteDataActionIntent: {
      return deleteDataAction({ request, userId, formData });
    }
    default: {
      throw new Response(
        `Invalid intent "${typeof intent === 'string' ? intent : 'unknown'}"`,
        { status: 400 },
      );
    }
  }
}

const SettingsProfileHub = () => {
  const data = useLoaderData<typeof loader>();
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Text as="h1" size="2xl" weight="semibold" className="text-foreground">
          Settings
        </Text>
        <Text size="sm" className="text-muted-foreground">
          Manage your profile, account, and preferences.
        </Text>
      </header>

      <ProfileCard onOpenPhoto={() => setPhotoOpen(true)} />
      <AccountCard />
      <PrivacyCard />
      <PreferencesCard />
      <DataCard />
      <DangerZoneCard />

      <ProfilePhotoSheet
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        currentImageId={data.user.image?.id ?? null}
        userName={data.user.name}
        userUsername={data.user.username}
      />
    </div>
  );
};
export default SettingsProfileHub;

// ─── Profile card ──────────────────────────────────────────────────────────

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function ProfilePhotoButton({
  onOpenPhoto,
}: Readonly<{ onOpenPhoto: () => void }>) {
  const data = useLoaderData<typeof loader>();
  return (
    <button
      type="button"
      onClick={onOpenPhoto}
      className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      aria-label="Change profile photo"
    >
      <Avatar
        size="l"
        className="max-h-40 max-w-40 sm:max-h-52 sm:max-w-52"
        image={
          data.user.image ? { id: data.user.image.id, altText: null } : null
        }
        user={{ name: data.user.name, username: data.user.username }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-foreground/0 text-transparent transition group-hover:bg-foreground/40 group-hover:text-background group-focus-visible:bg-foreground/40 group-focus-visible:text-background">
        <Icon name="camera" className="h-6 w-6" />
      </span>
    </button>
  );
}

function ProfileCard({ onOpenPhoto }: Readonly<{ onOpenPhoto: () => void }>) {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof profileUpdateAction>();
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);
  const [form, fields] = useForm<z.input<typeof ProfileFormSchema>>({
    id: 'edit-profile',
    constraint: getZodConstraint(ProfileFormSchema),
    lastResult: fetcher.data?.result as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: ProfileFormSchema }) as any;
    },
    defaultValue: {
      username: data.user.username,
      name: data.user.name,
      bio: data.user.bio ?? '',
      birthday: toDateInputValue(data.user.birthday),
    },
  });

  // Leave edit mode once the save lands so we drop back to the read view.
  useExitOnSubmitSuccess({
    state: fetcher.state,
    success: form.status === 'success',
    onExit: stopEditing,
  });

  const birthdayDisplay = data.user.birthday
    ? new Date(data.user.birthday).toLocaleDateString()
    : 'Not set';

  return (
    <EditableSection
      title="Profile"
      description="How you appear to friends across GiftPool."
      editLabel="Edit profile"
      editing={editing}
      onEdit={() => setEditing(true)}
      read={
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
          <ProfilePhotoButton onOpenPhoto={onOpenPhoto} />
          <div className="grid w-full flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadField label="Username" value={data.user.username} />
            <ReadField label="Name" value={data.user.name || 'Not set'} />
            <ReadField
              label="Bio"
              value={data.user.bio || 'No bio yet'}
              className="sm:col-span-2"
            />
            <ReadField label="Birthday" value={birthdayDisplay} />
          </div>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
        <ProfilePhotoButton onOpenPhoto={onOpenPhoto} />

        <fetcher.Form
          method="POST"
          {...getFormProps(form)}
          className="flex w-full flex-1 flex-col gap-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              labelProps={{
                htmlFor: fields.username.id,
                children: 'Username',
              }}
              inputProps={getInputProps(fields.username, { type: 'text' })}
              errors={fields.username.errors}
            />
            <Field
              labelProps={{
                htmlFor: fields.name.id,
                children: 'Name',
              }}
              inputProps={getInputProps(fields.name, { type: 'text' })}
              errors={fields.name.errors}
            />
          </div>
          <TextareaField
            labelProps={{
              htmlFor: fields.bio.id,
              children: `Bio (up to ${BIO_MAX_LENGTH} characters)`,
            }}
            textareaProps={{
              ...getInputProps(fields.bio, { type: 'text' }),
              required: false,
              rows: 3,
              maxLength: BIO_MAX_LENGTH,
              placeholder: 'Short blurb your friends will see on your profile.',
            }}
            errors={fields.bio.errors}
          />
          <Field
            labelProps={{
              htmlFor: fields.birthday.id,
              children: 'Birthday',
            }}
            inputProps={{
              ...getInputProps(fields.birthday, { type: 'date' }),
              required: false,
            }}
            errors={fields.birthday.errors}
          />
          <ErrorList errors={form.errors} id={form.errorId} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={stopEditing}>
              Cancel
            </Button>
            <StatusButton
              type="submit"
              name="intent"
              value={profileUpdateActionIntent}
              status={
                fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
              }
            >
              Save changes
            </StatusButton>
          </div>
        </fetcher.Form>
      </div>
    </EditableSection>
  );
}

// ─── Account card ──────────────────────────────────────────────────────────

function AccountCard() {
  const data = useLoaderData<typeof loader>();
  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <SectionHeading
        title="Account"
        description="Login credentials and security."
      />
      <div className="flex flex-col divide-y divide-border/60">
        <SettingsRow
          to="change-email"
          icon="envelope-closed"
          label="Email address"
          value={data.user.email}
          accessibleName="Change email address"
        />
        <SettingsRow
          to={data.hasPassword ? 'password' : 'password/create'}
          icon="dots-horizontal"
          label="Password"
          value={
            data.hasPassword ? 'Change your password' : 'Create a password'
          }
          accessibleName={
            data.hasPassword ? 'Change password' : 'Create password'
          }
        />
        <SettingsRow
          to="two-factor"
          icon={data.isTwoFactorEnabled ? 'lock-closed' : 'lock-open-1'}
          label="Two-factor authentication"
          value={data.isTwoFactorEnabled ? 'Enabled' : 'Not enabled'}
          accessibleName={
            data.isTwoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'
          }
        />
      </div>
    </Card>
  );
}

// ─── Privacy card ──────────────────────────────────────────────────────────

const BIRTHDAY_PRIVACY_OPTIONS: ReadonlyArray<{
  value: BirthdayVisibility;
  label: string;
  description: string;
}> = [
  {
    value: 'EVERYONE',
    label: 'Everyone',
    description: 'Visible to anyone who lands on your profile.',
  },
  {
    value: 'FRIENDS_OF_FRIENDS',
    label: 'Friends of friends',
    description:
      'Visible to your friends and people who share mutual friends with you.',
  },
  {
    value: 'FRIENDS',
    label: 'Friends only',
    description: "Only people you're friends with on GiftPool can see it.",
  },
  {
    value: 'NOBODY',
    label: 'Nobody',
    description: 'Keep it private — nobody sees it on your profile.',
  },
];

const WISHLIST_PRIVACY_OPTIONS: ReadonlyArray<{
  value: WishlistVisibility;
  label: string;
  description: string;
}> = [
  {
    value: 'EVERYONE',
    label: 'Everyone',
    description: 'Anyone with a GiftPool account can view your wishlist.',
  },
  {
    value: 'FRIENDS_OF_FRIENDS',
    label: 'Friends of friends',
    description: 'Your friends and people who share mutual friends with you.',
  },
  {
    value: 'FRIENDS',
    label: 'Friends only',
    description: "Only people you're friends with on GiftPool.",
  },
];

function VisibilityRadioGroup<T extends string>({
  legend,
  name,
  options,
  selected,
  onChange,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: T; label: string; description: string }>;
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">
        {legend}
      </legend>
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        const isSelected = selected === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            aria-label={option.label}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 transition hover:border-border"
            data-selected={isSelected || undefined}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={isSelected}
              onChange={(event) => onChange(event.currentTarget.value as T)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {option.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function privacyLabel<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function PrivacyCard() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof privacyUpdateAction>();
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  const currentBirthday =
    (data.user.birthdayVisibility as BirthdayVisibility | undefined) ??
    'FRIENDS';
  const currentWishlist =
    (data.user.wishlistVisibility as WishlistVisibility | undefined) ??
    'FRIENDS';

  // Draft selections — changing a visibility setting is deliberate now (R5.2):
  // radios update local state and nothing persists until Save is pressed.
  const [draftBirthday, setDraftBirthday] =
    useState<BirthdayVisibility>(currentBirthday);
  const [draftWishlist, setDraftWishlist] =
    useState<WishlistVisibility>(currentWishlist);

  const saved = Boolean((fetcher.data as { ok?: boolean } | undefined)?.ok);
  useExitOnSubmitSuccess({
    state: fetcher.state,
    success: saved,
    onExit: stopEditing,
  });

  function startEditing() {
    setDraftBirthday(currentBirthday);
    setDraftWishlist(currentWishlist);
    setEditing(true);
  }

  function savePrivacy() {
    const formData = new FormData();
    formData.set('intent', privacyUpdateActionIntent);
    formData.set('birthdayVisibility', draftBirthday);
    formData.set('wishlistVisibility', draftWishlist);
    void fetcher.submit(formData, { method: 'POST' });
  }

  return (
    <EditableSection
      title="Privacy"
      description="Control who can see personal details on your profile."
      editing={editing}
      onEdit={startEditing}
      read={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReadField
            label="Birthday visibility"
            value={privacyLabel(BIRTHDAY_PRIVACY_OPTIONS, currentBirthday)}
          />
          <ReadField
            label="Wishlist visibility"
            value={privacyLabel(WISHLIST_PRIVACY_OPTIONS, currentWishlist)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <VisibilityRadioGroup
          legend="Birthday visibility"
          name="birthdayVisibility"
          options={BIRTHDAY_PRIVACY_OPTIONS}
          selected={draftBirthday}
          onChange={setDraftBirthday}
        />
        <VisibilityRadioGroup
          legend="Wishlist visibility"
          name="wishlistVisibility"
          options={WISHLIST_PRIVACY_OPTIONS}
          selected={draftWishlist}
          onChange={setDraftWishlist}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={stopEditing}>
            Cancel
          </Button>
          <StatusButton
            type="button"
            onClick={savePrivacy}
            status={fetcher.state !== 'idle' ? 'pending' : 'idle'}
          >
            Save privacy
          </StatusButton>
        </div>
      </div>
    </EditableSection>
  );
}

// ─── Preferences card ──────────────────────────────────────────────────────

function PreferencesCard() {
  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <SectionHeading
        title="Preferences"
        description="Choose how and when GiftPool reaches out."
      />
      <div className="flex flex-col divide-y divide-border/60">
        <SettingsRow
          to="notifications"
          icon="dots-horizontal"
          label="Notifications"
          value="In-app and email preferences"
        />
      </div>
    </Card>
  );
}

// ─── Data card ─────────────────────────────────────────────────────────────

function DataCard() {
  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <SectionHeading
        title="Your data"
        description="Take your information with you at any time."
      />
      <div>
        <Button asChild variant="outline">
          <Link
            reloadDocument
            download="giftpool-data.json"
            to="/resources/download-user-data"
          >
            <Icon name="download">Download your data</Icon>
          </Link>
        </Button>
      </div>
    </Card>
  );
}

// ─── Danger zone ───────────────────────────────────────────────────────────

function DangerZoneCard() {
  const data = useLoaderData<typeof loader>();
  const otherSessionsCount = data.user._count.sessions - 1;
  const dc = useDoubleCheck();
  const fetcher = useFetcher<typeof signOutOfSessionsAction>();
  const sessionsLabel = `Sign out of ${otherSessionsCount} other session${otherSessionsCount === 1 ? '' : 's'}`;

  return (
    <Card
      padding="lg"
      className="flex flex-col gap-5 border-destructive/40 bg-destructive/5"
    >
      <SectionHeading
        title="Danger zone"
        description="These actions are destructive. Double-check before you tap."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {otherSessionsCount > 0 ? (
          <fetcher.Form method="POST">
            <StatusButton
              {...dc.getButtonProps({
                type: 'submit',
                name: 'intent',
                value: signOutOfSessionsActionIntent,
              })}
              variant={dc.doubleCheck ? 'destructive' : 'outline'}
              status={
                fetcher.state !== 'idle'
                  ? 'pending'
                  : (fetcher.data?.status ?? 'idle')
              }
            >
              <Icon name="avatar">
                {dc.doubleCheck ? 'Are you sure?' : sessionsLabel}
              </Icon>
            </StatusButton>
          </fetcher.Form>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="avatar" className="h-4 w-4" />
            This is your only active session.
          </div>
        )}

        <DangerZoneDeleteDialog
          username={data.user.username}
          intent={deleteDataActionIntent}
        />
      </div>
    </Card>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────

function SectionHeading({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text as="h2" size="lg" weight="semibold" className="text-foreground">
        {title}
      </Text>
      <Text size="xs" className="text-muted-foreground">
        {description}
      </Text>
    </div>
  );
}

type IconName = React.ComponentProps<typeof Icon>['name'];

function SettingsRow({
  to,
  icon,
  label,
  value,
  accessibleName,
}: Readonly<{
  to: string;
  icon: IconName;
  label: string;
  value: string;
  accessibleName?: string;
}>) {
  return (
    <Link
      to={to}
      prefetch="intent"
      aria-label={accessibleName ?? label}
      className="group flex items-center gap-3 py-3 text-left transition hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <Text size="sm" weight="medium" className="text-foreground">
          {label}
        </Text>
        <Text size="xs" className="truncate text-muted-foreground">
          {value}
        </Text>
      </div>
      <Icon
        name="chevron-right"
        className="h-4 w-4 flex-shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
      />
    </Link>
  );
}

// ─── Server actions ────────────────────────────────────────────────────────

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
  const submission = await parseWithZod(formData, {
    async: true,
    schema: ProfileFormSchema.superRefine(async ({ username }, ctx) => {
      const existingUsername = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (existingUsername && existingUsername.id !== userId) {
        ctx.addIssue({
          path: ['username'],
          code: z.ZodIssueCode.custom,
          message: 'A user already exists with this username',
        });
      }
    }),
  });
  if (submission.status !== 'success') {
    return rrData(
      { result: submission.reply() },
      { status: submission.status === 'error' ? 400 : 200 },
    );
  }
  const data = submission.value;
  const trimmedBio = data.bio?.trim();
  await prisma.user.update({
    select: { username: true },
    where: { id: userId },
    data: {
      name: data.name,
      username: data.username,
      bio: trimmedBio || null,
      birthday: data.birthday ?? null,
    },
  });
  return { result: submission.reply() };
}

async function privacyUpdateAction({ userId, formData }: ProfileActionArgs) {
  const submission = parseWithZod(formData, { schema: PrivacyFormSchema });
  if (submission.status !== 'success') {
    return rrData(
      { result: submission.reply() },
      { status: submission.status === 'error' ? 400 : 200 },
    );
  }
  await prisma.user.update({
    select: { id: true },
    where: { id: userId },
    data: {
      birthdayVisibility: submission.value.birthdayVisibility,
      wishlistVisibility: submission.value.wishlistVisibility,
    },
  });
  return { result: submission.reply(), ok: true };
}

async function signOutOfSessionsAction({ request, userId }: ProfileActionArgs) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie'),
  );
  const sessionId = authSession.get(sessionKey);
  invariantResponse(
    sessionId,
    'You must be authenticated to sign out of other sessions',
  );
  await prisma.session.deleteMany({
    where: {
      userId,
      id: { not: sessionId },
    },
  });
  return { status: 'success' } as const;
}

async function deleteDataAction({ userId }: ProfileActionArgs) {
  // `WishlistClaim.claimedByUserId` cascades on User deletion — a bare
  // `prisma.user.delete` would remove this user's solo claims at the DB
  // level with no `.wishlistClaim` call in sight, so the write-guard test
  // stays green while a decided pool waiting behind that claim never
  // settles onto the item (it's simply left free). Release-and-settle every
  // solo claim through the module's batch entry point FIRST, while the user
  // (and therefore the claim rows) still exist, so a waiting pool inherits
  // before the account — and the cascade that would otherwise silently
  // remove the evidence of that claim — goes away. `releaseSoloClaimsMatching`
  // is a no-op (empty array, no throw) when the user holds no solo claims,
  // so this never blocks deletion.
  const released = await releaseSoloClaimsMatching({ claimedByUserId: userId });
  for (const release of released) {
    if (!release.transferredToPoolId || !release.transferredClaimId) continue;
    queueWishlistClaimTransferredNotification(
      release.transferredToPoolId,
      release.wishlistItemId,
      release.transferredClaimId,
    );
  }
  // Every exchange foreign key to User cascades, including
  // `Exchange.organizerId` — deleting an organizer would delete the whole
  // exchange for their group, and deleting a participant mid-draw would leave
  // two other people with a broken loop and no explanation. Splice, hand over
  // or cancel first, in the same transaction as the deletion itself: if the
  // delete fails on some other constraint, the exchange must not be left
  // detached from an account that still exists.
  const exchangeSummary = await prisma.$transaction(async (tx) => {
    const summary = await prepareExchangesForAccountDeletion({
      userId,
      db: tx,
    });
    await tx.user.delete({ where: { id: userId } });
    return summary;
  });
  announceExchangeAccountDeletion(exchangeSummary);
  return redirectWithToast('/', {
    type: 'success',
    title: 'Data Deleted',
    description: 'All of your data has been deleted',
  });
}
