// Avoid strict coupling to a specific Conform Submission type instance.
// We only depend on the minimal shape used by handlers.
import { parseWithZod } from '@conform-to/zod';
import { data } from 'react-router';
import { z } from 'zod';
import { handleVerification as handleChangeEmailVerification } from '#app/routes/settings+/profile.change-email.server.tsx';
import { twoFAVerificationType } from '#app/routes/settings+/profile.two-factor.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import { getDomainUrl } from '#app/utils/misc.tsx';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';
import { generateTOTP, verifyTOTP } from '#app/utils/totp.server.ts';
import { type twoFAVerifyVerificationType } from '../settings+/profile.two-factor.verify.tsx';
import {
  handleVerification as handleLoginTwoFactorVerification,
  shouldRequestTwoFA,
} from './login.server.ts';
import { handleVerification as handleOnboardingVerification } from './onboarding.server.ts';
import { handleVerification as handleResetPasswordVerification } from './reset-password.server.ts';
import {
  VerifySchema,
  codeQueryParam,
  redirectToQueryParam,
  targetQueryParam,
  typeQueryParam,
  type VerificationTypes,
} from './verify.tsx';
export type VerifyFunctionArgs = {
  request: Request;
  submission: any;
  body: FormData | URLSearchParams;
};
export function getRedirectToUrl({
  request,
  type,
  target,
  redirectTo,
}: {
  request: Request;
  type: VerificationTypes;
  target: string;
  redirectTo?: string;
}) {
  const redirectToUrl = new URL(`${getDomainUrl(request)}/verify`);
  redirectToUrl.searchParams.set(typeQueryParam, type);
  redirectToUrl.searchParams.set(targetQueryParam, target);
  if (redirectTo) {
    redirectToUrl.searchParams.set(redirectToQueryParam, redirectTo);
  }
  return redirectToUrl;
}

export function getPostVerificationRedirectPath(request: Request) {
  const reqUrl = new URL(request.url);
  const searchParams = new URLSearchParams(reqUrl.search);
  let pathname = reqUrl.pathname;

  if (pathname === '/_root.data') {
    pathname = '/';
  } else if (pathname.endsWith('/_.data')) {
    pathname = pathname.slice(0, -'_.data'.length);
  } else if (pathname.endsWith('.data')) {
    pathname = pathname.slice(0, -'.data'.length);
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  searchParams.delete('_data');
  searchParams.delete('_routes');
  searchParams.delete('index');

  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export async function requireRecentVerification(request: Request) {
  const userId = await requireUserId(request);
  const shouldReverify = await shouldRequestTwoFA(request);
  if (shouldReverify) {
    const redirectUrl = getRedirectToUrl({
      request,
      target: userId,
      type: twoFAVerificationType,
      redirectTo: getPostVerificationRedirectPath(request),
    });
    throw await redirectWithToast(redirectUrl.toString(), {
      title: 'Please Reverify',
      description: 'Please reverify your account before proceeding',
    });
  }
}
export async function prepareVerification({
  period,
  request,
  type,
  target,
  redirectTo: postVerificationRedirectTo,
}: {
  period: number;
  request: Request;
  type: VerificationTypes;
  target: string;
  /**
   * Where the user should land AFTER the whole verification flow completes
   * (e.g. the invite page that sent them to signup). Carried through the
   * verify URL and the emailed magic link.
   */
  redirectTo?: string;
}) {
  const verifyUrl = getRedirectToUrl({
    request,
    type,
    target,
    redirectTo: postVerificationRedirectTo,
  });
  const redirectTo = new URL(verifyUrl.toString());
  const { otp, ...verificationConfig } = generateTOTP({
    algorithm: 'SHA256',
    charSet: '0123456789',
    period,
  });
  const verificationData = {
    type,
    target,
    ...verificationConfig,
    expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
  };
  await prisma.verification.upsert({
    where: {
      target_type: {
        target,
        type,
      },
    },
    create: verificationData,
    update: verificationData,
  });

  // add the otp to the url we'll email the user.
  verifyUrl.searchParams.set(codeQueryParam, otp);
  return {
    otp,
    redirectTo,
    verifyUrl,
  };
}
export async function isCodeValid({
  code,
  type,
  target,
}: {
  code: string;
  type: VerificationTypes | typeof twoFAVerifyVerificationType;
  target: string;
}) {
  const verification = await prisma.verification.findUnique({
    where: {
      target_type: {
        target,
        type,
      },
      OR: [
        {
          expiresAt: {
            gt: new Date(),
          },
        },
        {
          expiresAt: null,
        },
      ],
    },
    select: {
      algorithm: true,
      secret: true,
      period: true,
      charSet: true,
    },
  });
  if (!verification) return false;
  const result = verifyTOTP({
    otp: code,
    ...verification,
  });
  if (!result) return false;
  return true;
}
// Re-send the onboarding verification email (June 2026 audit: the verify
// screen was a hard wall when the email was delayed or spam-foldered).
// Scoped to `onboarding` — other types have different emails and flows.
// The /verify path sits on the strongest rate-limit tier, which bounds abuse.
export async function handleResend(request: Request, body: FormData) {
  const type = body.get(typeQueryParam);
  const target = body.get(targetQueryParam);
  const redirectTo = body.get(redirectToQueryParam);
  if (type !== 'onboarding' || typeof target !== 'string' || !target) {
    return data({ error: 'Cannot resend this code.' }, { status: 400 });
  }
  const { SignupEmail } = await import('#app/emails/signup-email.tsx');
  const { verifyUrl, otp } = await prepareVerification({
    period: 10 * 60,
    request,
    type: 'onboarding',
    target,
    redirectTo: typeof redirectTo === 'string' ? redirectTo : undefined,
  });
  const response = await sendEmail({
    to: target,
    subject: `Welcome to GiftPool!`,
    react: SignupEmail({ onboardingUrl: verifyUrl.toString(), otp }),
  });
  if (response.status === 'success') {
    return data({ resent: true as const });
  }
  return data({ error: response.error.message }, { status: 500 });
}

export async function validateRequest(
  request: Request,
  body: URLSearchParams | FormData,
) {
  const submission = await parseWithZod(body, {
    schema: VerifySchema.superRefine(async (data, ctx) => {
      const codeIsValid = await isCodeValid({
        code: data[codeQueryParam],
        type: data[typeQueryParam],
        target: data[targetQueryParam],
      });
      if (!codeIsValid) {
        ctx.addIssue({
          path: ['code'],
          code: z.ZodIssueCode.custom,
          message: `Invalid code`,
        });
        return;
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
  const { value: submissionValue } = submission;
  async function deleteVerification() {
    await prisma.verification.delete({
      where: {
        target_type: {
          type: submissionValue[typeQueryParam],
          target: submissionValue[targetQueryParam],
        },
      },
    });
  }
  switch (submissionValue[typeQueryParam]) {
    case 'reset-password': {
      await deleteVerification();
      return handleResetPasswordVerification({
        request,
        body,
        submission,
      });
    }
    case 'onboarding': {
      await deleteVerification();
      // Funnel step between signup_submitted and user_registered — the email
      // is verified but the account doesn't exist yet, so visitorId only.
      const { requestId, visitorId } = await getRequestContext(request);
      queueLogEvent({
        name: 'signup_email_verified',
        source: 'server',
        requestId,
        visitorId,
      });
      return handleOnboardingVerification({
        request,
        body,
        submission,
      });
    }
    case 'change-email': {
      await deleteVerification();
      return handleChangeEmailVerification({
        request,
        body,
        submission,
      });
    }
    case '2fa': {
      return handleLoginTwoFactorVerification({
        request,
        body,
        submission,
      });
    }
  }
}
