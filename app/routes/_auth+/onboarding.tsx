import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import {
  data,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type MetaFunction,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import { HoneypotInputs } from 'remix-utils/honeypot/react';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { z } from 'zod';
import { CheckboxField, ErrorList, Field } from '#app/components/forms.tsx';
import { Spacer } from '#app/components/spacer.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import {
  requireAnonymous,
  sessionKey,
  signup,
} from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { checkHoneypot } from '#app/utils/honeypot.server.ts';
import { useIsPending } from '#app/utils/misc.tsx';
import { CURRENT_LEGAL_VERSION } from '#app/utils/legal.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { authSessionStorage } from '#app/utils/session.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';
import {
  NameSchema,
  PasswordAndConfirmPasswordSchema,
  UsernameSchema,
} from '#app/utils/user-validation.ts';
import { verifySessionStorage } from '#app/utils/verification.server.ts';
export const onboardingEmailSessionKey = 'onboardingEmail';
export const SignupFormSchema = z
  .object({
    username: UsernameSchema,
    name: NameSchema,
    agreeToTermsOfServiceAndPrivacyPolicy: z
      .boolean({
        required_error:
          'You must agree to the terms of service and privacy policy, and confirm you are at least 13 years old',
      })
      .refine((val) => val === true, {
        message:
          'You must agree to the terms of service and privacy policy, and confirm you are at least 13 years old',
      }),
    remember: z.boolean().optional(),
    redirectTo: z.string().optional(),
  })
  .and(PasswordAndConfirmPasswordSchema);
async function requireOnboardingEmail(request: Request) {
  await requireAnonymous(request);
  const verifySession = await verifySessionStorage.getSession(
    request.headers.get('cookie'),
  );
  const email = verifySession.get(onboardingEmailSessionKey);
  if (typeof email !== 'string' || !email) {
    throw redirect('/signup');
  }
  return email;
}
export async function loader({ request }: LoaderFunctionArgs) {
  const email = await requireOnboardingEmail(request);
  return {
    email,
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const email = await requireOnboardingEmail(request);
  const { requestId, visitorId } = await getRequestContext(request);
  // Captured for evidentiary strength on the consent record. Best-effort —
  // null when no proxy header is present (e.g. local dev).
  const ipAddress =
    request.headers.get('fly-client-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;
  const formData = await request.formData();
  await checkHoneypot(formData);
  const submission = await parseWithZod(formData, {
    schema: (intent) =>
      SignupFormSchema.superRefine(async (data, ctx) => {
        const existingUser = await prisma.user.findUnique({
          where: {
            username: data.username,
          },
          select: {
            id: true,
          },
        });
        if (existingUser) {
          ctx.addIssue({
            path: ['username'],
            code: z.ZodIssueCode.custom,
            message: 'A user already exists with this username',
          });
          return;
        }
      }).transform(async (data) => {
        if (intent !== null)
          return {
            ...data,
            session: null,
          };
        const session = await signup({
          email,
          username: data.username,
          name: data.name,
          password: data.password,
          consent: {
            version: CURRENT_LEGAL_VERSION,
            // The single clickwrap checkbox covers both the legal agreement
            // and the 13+ self-attestation, so a successful submission means
            // both were affirmed.
            ageAffirmed: data.agreeToTermsOfServiceAndPrivacyPolicy,
            ipAddress,
          },
        });
        return {
          ...data,
          session,
        };
      }),
    async: true,
  });
  if (submission.status !== 'success' || !submission.value.session) {
    return data(
      {
        result: submission.reply(),
      },
      {
        status: submission.status === 'error' ? 400 : 200,
      },
    );
  }
  const { session, remember, redirectTo } = submission.value;
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie'),
  );
  authSession.set(sessionKey, session.id);
  const verifySession = await verifySessionStorage.getSession();
  const headers = new Headers();
  headers.append(
    'set-cookie',
    await authSessionStorage.commitSession(authSession, {
      expires: remember ? session.expirationDate : undefined,
    }),
  );
  headers.append(
    'set-cookie',
    await verifySessionStorage.destroySession(verifySession),
  );
  queueLogEvent({
    name: 'user_registered',
    userId: session.userId,
    source: 'server',
    requestId,
    sessionId: session.id,
    // Joins the anonymous signup_submitted / signup_email_verified /
    // invite_landed events to the new account.
    visitorId,
    properties: {
      remember: remember ?? false,
    },
  });
  return redirectWithToast(
    safeRedirect(redirectTo),
    {
      title: 'Welcome',
      description: 'Thanks for signing up!',
    },
    {
      headers,
    },
  );
}
export const meta: MetaFunction = () => {
  return [
    {
      title: 'Setup GiftPool Account',
    },
  ];
};
const OnboardingRoute = () => {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const [form, fields] = useForm<z.input<typeof SignupFormSchema>>({
    id: 'onboarding-form',
    constraint: getZodConstraint(SignupFormSchema),
    defaultValue: {
      redirectTo,
    },
    lastResult: actionData?.result as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: SignupFormSchema,
      }) as any;
    },
    shouldRevalidate: 'onBlur',
  });
  return (
    <div className="container flex min-h-full flex-col justify-center pb-32 pt-20">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="text-h1">Welcome aboard {data.email}!</h1>
          <p className="text-body-md text-muted-foreground">
            Please enter your details.
          </p>
        </div>
        <Spacer size="xs" />
        <Form
          method="POST"
          className="mx-auto flex min-w-full max-w-sm flex-col gap-4 sm:min-w-[368px]"
          {...getFormProps(form)}
        >
          <HoneypotInputs />
          <Field
            labelProps={{
              htmlFor: fields.username.id,
              children: 'Username',
            }}
            inputProps={{
              ...getInputProps(fields.username, {
                type: 'text',
              }),
              autoComplete: 'username',
              className: 'lowercase',
            }}
            errors={fields.username.errors}
            description="Letters, numbers, and underscores only."
          />
          <Field
            labelProps={{
              htmlFor: fields.name.id,
              children: 'Name',
            }}
            inputProps={{
              ...getInputProps(fields.name, {
                type: 'text',
              }),
              autoComplete: 'name',
            }}
            errors={fields.name.errors}
          />
          <Field
            labelProps={{
              htmlFor: fields.password.id,
              children: 'Password',
            }}
            inputProps={{
              ...getInputProps(fields.password, {
                type: 'password',
              }),
              autoComplete: 'new-password',
            }}
            errors={fields.password.errors}
            description="At least 6 characters."
          />

          <Field
            labelProps={{
              htmlFor: fields.confirmPassword.id,
              children: 'Confirm Password',
            }}
            inputProps={{
              ...getInputProps(fields.confirmPassword, {
                type: 'password',
              }),
              autoComplete: 'new-password',
            }}
            errors={fields.confirmPassword.errors}
          />

          <CheckboxField
            labelProps={{
              htmlFor: fields.agreeToTermsOfServiceAndPrivacyPolicy.id,
              children: (
                <>
                  I agree to the{' '}
                  <Link
                    to="/tos"
                    target="_blank"
                    className="underline hover:text-foreground"
                  >
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link
                    to="/privacy"
                    target="_blank"
                    className="underline hover:text-foreground"
                  >
                    Privacy Policy
                  </Link>
                  , and I confirm I am at least 13 years old
                </>
              ),
            }}
            buttonProps={{
              ...getInputProps(fields.agreeToTermsOfServiceAndPrivacyPolicy, {
                type: 'checkbox',
              }),
              // The visual label's link text doesn't reach the accessible
              // name (it reads "I agree to the and" to screen readers).
              'aria-label':
                'I agree to the Terms of Service and Privacy Policy, and I confirm I am at least 13 years old',
            }}
            errors={fields.agreeToTermsOfServiceAndPrivacyPolicy.errors}
          />
          <CheckboxField
            labelProps={{
              htmlFor: fields.remember.id,
              children: 'Remember me',
            }}
            buttonProps={getInputProps(fields.remember, {
              type: 'checkbox',
            })}
            errors={fields.remember.errors}
          />

          <input
            {...getInputProps(fields.redirectTo, {
              type: 'hidden',
            })}
          />
          {/* Reserves the error line's height so clearing it on blur can't shift the button mid-click. */}
          <div className="min-h-5">
            <ErrorList errors={form.errors} id={form.errorId} />
          </div>

          <div className="flex items-center justify-between gap-6">
            <StatusButton
              className="w-full"
              status={isPending ? 'pending' : (form.status ?? 'idle')}
              type="submit"
              disabled={isPending}
            >
              Create an account
            </StatusButton>
          </div>
        </Form>
      </div>
    </div>
  );
};
export default OnboardingRoute;
