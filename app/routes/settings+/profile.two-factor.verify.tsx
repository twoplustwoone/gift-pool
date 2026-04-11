import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import * as QRCode from 'qrcode';
import {
  data,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  Form,
  useActionData,
  useLoaderData,
  useNavigation
} from 'react-router';
import { z } from 'zod';
import { ErrorList, OTPField } from '#app/components/forms.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { isCodeValid } from '#app/routes/_auth+/verify.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getDomainUrl, useIsPending } from '#app/utils/misc.tsx';
import { redirectWithToast } from '#app/utils/toast.server.ts';
import { getTOTPAuthUri } from '#app/utils/totp.server.ts';
import { SettingsSubpage } from './__settings-subpage.tsx';
import { twoFAVerificationType } from './profile.two-factor.tsx';
export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};
const CancelSchema = z.object({
  intent: z.literal('cancel'),
});
const VerifySchema = z.object({
  intent: z.literal('verify'),
  code: z.string().min(6).max(6),
});
const ActionSchema = z.discriminatedUnion('intent', [
  CancelSchema,
  VerifySchema,
]);
export const twoFAVerifyVerificationType = '2fa-verify';
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const verification = await prisma.verification.findUnique({
    where: {
      target_type: {
        type: twoFAVerifyVerificationType,
        target: userId,
      },
    },
    select: {
      id: true,
      algorithm: true,
      secret: true,
      period: true,
      digits: true,
    },
  });
  if (!verification) {
    return redirect('/settings/profile/two-factor');
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id: userId,
    },
    select: {
      email: true,
    },
  });
  const issuer = new URL(getDomainUrl(request)).host;
  const otpUri = getTOTPAuthUri({
    ...verification,
    accountName: user.email,
    issuer,
  });
  const qrCode = await QRCode.toDataURL(otpUri);
  return {
    otpUri,
    qrCode,
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = await parseWithZod(formData, {
    schema: () =>
      ActionSchema.superRefine(async (data, ctx) => {
        if (data.intent === 'cancel') return null;
        const codeIsValid = await isCodeValid({
          code: data.code,
          type: twoFAVerifyVerificationType,
          target: userId,
        });
        if (!codeIsValid) {
          ctx.addIssue({
            path: ['code'],
            code: z.ZodIssueCode.custom,
            message: `Invalid code`,
          });
          return z.NEVER;
        }
      }),
    async: true,
  });
  if (submission.status !== 'success') {
    return data(
      {
        result: submission.reply(),
      },
      {
        status: submission.status === 'error' ? 400 : 200,
      },
    );
  }
  switch (submission.value.intent) {
    case 'cancel': {
      await prisma.verification.deleteMany({
        where: {
          type: twoFAVerifyVerificationType,
          target: userId,
        },
      });
      return redirect('/settings/profile/two-factor');
    }
    case 'verify': {
      await prisma.verification.update({
        where: {
          target_type: {
            type: twoFAVerifyVerificationType,
            target: userId,
          },
        },
        data: {
          type: twoFAVerificationType,
        },
      });
      return redirectWithToast('/settings/profile/two-factor', {
        type: 'success',
        title: 'Enabled',
        description: 'Two-factor authentication has been enabled.',
      });
    }
  }
}
const TwoFactorRoute = () => {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isPending = useIsPending();
  const pendingIntent = isPending ? navigation.formData?.get('intent') : null;
  const [form, fields] = useForm<z.input<typeof ActionSchema>>({
    id: 'verify-form',
    constraint: getZodConstraint(ActionSchema),
    lastResult: actionData?.result as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: ActionSchema,
      }) as any;
    },
  });
  const lastSubmissionIntent = fields.intent.value;
  const verifyStatus =
    pendingIntent === 'verify'
      ? ('pending' as const)
      : lastSubmissionIntent === 'verify'
        ? (form.status ?? 'idle')
        : 'idle';
  const cancelStatus =
    pendingIntent === 'cancel'
      ? ('pending' as const)
      : lastSubmissionIntent === 'cancel'
        ? (form.status ?? 'idle')
        : 'idle';
  return (
    <SettingsSubpage
      title="Verify two-factor setup"
      description="Scan the QR code with your authenticator app and enter the code it generates."
    >
      <div className="flex flex-col items-center gap-4">
        <img alt="qr code" src={data.qrCode} className="h-56 w-56 rounded-lg" />
        <p className="text-sm text-muted-foreground">
          Can't scan? Enter this code into your authenticator app instead:
        </p>
        <pre
          className="w-full overflow-x-auto rounded-lg bg-muted/60 px-3 py-2 text-xs"
          aria-label="One-Time Password URI"
        >
          {data.otpUri}
        </pre>
        <p className="text-xs text-muted-foreground">
          Once 2FA is on you'll need a code every time you sign in. Don't lose
          access to your authenticator or you'll lose access to your account.
        </p>
        <Form method="POST" {...getFormProps(form)} className="flex w-full max-w-xs flex-col gap-3">
          <OTPField
            labelProps={{ htmlFor: fields.code.id, children: 'Code' }}
            inputProps={{
              ...getInputProps(fields.code, { type: 'text' }),
              autoFocus: true,
              autoComplete: 'one-time-code',
            }}
            errors={fields.code.errors}
          />
          <ErrorList id={form.errorId} errors={form.errors} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <StatusButton
              variant="outline"
              status={cancelStatus}
              type="submit"
              name="intent"
              value="cancel"
              disabled={isPending}
            >
              Cancel
            </StatusButton>
            <StatusButton
              status={verifyStatus}
              type="submit"
              name="intent"
              value="verify"
            >
              Submit
            </StatusButton>
          </div>
        </Form>
      </div>
    </SettingsSubpage>
  );
};
export default TwoFactorRoute;
