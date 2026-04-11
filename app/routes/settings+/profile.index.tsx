import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import { useState } from 'react';
import {
  data as rrData,
  Link,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import { ErrorList, Field } from '#app/components/forms.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { requireUserId, sessionKey } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { useDoubleCheck } from '#app/utils/misc.tsx';
import { authSessionStorage } from '#app/utils/session.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts';
import { DangerZoneDeleteDialog } from './__danger-zone-delete-dialog.tsx';
import { ProfilePhotoSheet } from './__profile-photo-sheet.tsx';
import { twoFAVerificationType } from './profile.two-factor.tsx';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

const ProfileFormSchema = z.object({
  name: NameSchema.optional(),
  username: UsernameSchema,
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
    case signOutOfSessionsActionIntent: {
      return signOutOfSessionsAction({ request, userId, formData });
    }
    case deleteDataActionIntent: {
      return deleteDataAction({ request, userId, formData });
    }
    default: {
      throw new Response(`Invalid intent "${intent}"`, { status: 400 });
    }
  }
}

const SettingsProfileHub = () => {
  const data = useLoaderData<typeof loader>();
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Text
          as="h1"
          size="2xl"
          weight="semibold"
          className="text-foreground"
        >
          Settings
        </Text>
        <Text size="sm" className="text-muted-foreground">
          Manage your profile, account, and preferences.
        </Text>
      </header>

      <ProfileCard onOpenPhoto={() => setPhotoOpen(true)} />
      <AccountCard />
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

function ProfileCard({ onOpenPhoto }: Readonly<{ onOpenPhoto: () => void }>) {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof profileUpdateAction>();
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
    },
  });

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <SectionHeading
        title="Profile"
        description="How you appear to friends across GiftPool."
      />

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
        <button
          type="button"
          onClick={onOpenPhoto}
          className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Change profile photo"
        >
          <Avatar
            size="l"
            image={
              data.user.image
                ? { id: data.user.image.id, altText: null }
                : null
            }
            user={{ name: data.user.name, username: data.user.username }}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-foreground/0 text-transparent transition group-hover:bg-foreground/40 group-hover:text-background group-focus-visible:bg-foreground/40 group-focus-visible:text-background">
            <Icon name="camera" className="h-6 w-6" />
          </span>
        </button>

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
          <ErrorList errors={form.errors} id={form.errorId} />
          <div className="flex justify-end">
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
    </Card>
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
          value={data.hasPassword ? 'Change your password' : 'Create a password'}
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
            data.isTwoFactorEnabled
              ? 'Manage two-factor authentication'
              : 'Enable two-factor authentication'
          }
        />
      </div>
    </Card>
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
                {dc.doubleCheck
                  ? 'Are you sure?'
                  : `Sign out of ${otherSessionsCount} other session${otherSessionsCount === 1 ? '' : 's'}`}
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
  await prisma.user.update({
    select: { username: true },
    where: { id: userId },
    data: {
      name: data.name,
      username: data.username,
    },
  });
  return { result: submission.reply() };
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
  await prisma.user.delete({ where: { id: userId } });
  return redirectWithToast('/', {
    type: 'success',
    title: 'Data Deleted',
    description: 'All of your data has been deleted',
  });
}
