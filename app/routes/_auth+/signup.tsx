import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import {
  data,
  redirect,
  type ActionFunctionArgs,
  type MetaFunction,
  Form,
  Link,
  useActionData,
} from 'react-router';
import { HoneypotInputs } from 'remix-utils/honeypot/react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { ErrorList, Field } from '#app/components/forms.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import { checkHoneypot } from '#app/utils/honeypot.server.ts';
import { useIsPending } from '#app/utils/misc.tsx';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { EmailSchema } from '#app/utils/user-validation.ts';
import { prepareVerification } from './verify.server.ts';
export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};
const SignupSchema = z.object({
  email: EmailSchema,
});
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  await checkHoneypot(formData);
  const submission = await parseWithZod(formData, {
    schema: SignupSchema.superRefine(async (data, ctx) => {
      const existingUser = await prisma.user.findUnique({
        where: {
          email: data.email,
        },
        select: {
          id: true,
        },
      });
      if (existingUser) {
        ctx.addIssue({
          path: ['email'],
          code: z.ZodIssueCode.custom,
          message: 'A user already exists with this email',
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
  const { email } = submission.value;
  // Import the email template server-side only to avoid bundling it for the browser.
  const { SignupEmail } = await import('#app/emails/signup-email.tsx');
  const { verifyUrl, redirectTo, otp } = await prepareVerification({
    period: 10 * 60,
    request,
    type: 'onboarding',
    target: email,
    // Carry the original intent (e.g. an invite page or /wishlist) through
    // verify → onboarding so signup delivers the user where they meant to go.
    redirectTo:
      new URL(request.url).searchParams.get('redirectTo') ?? undefined,
  });
  const response = await sendEmail({
    to: email,
    subject: `Welcome to GiftPool!`,
    react: <SignupEmail onboardingUrl={verifyUrl.toString()} otp={otp} />,
  });
  if (response.status === 'success') {
    // Funnel entry for user_registered — joined via visitorId, since no
    // account exists yet. No email in properties (PII).
    const { requestId, visitorId } = await getRequestContext(request);
    queueLogEvent({
      name: 'signup_submitted',
      source: 'server',
      requestId,
      visitorId,
    });
    return redirect(redirectTo.toString());
  } else {
    return data(
      {
        result: submission.reply({
          formErrors: [response.error.message],
        }),
      },
      {
        status: 500,
      },
    );
  }
}
export const meta: MetaFunction = () => {
  return [
    {
      title: 'Sign Up | GiftPool',
    },
  ];
};
const SignupRoute = () => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  // No redirect param used on signup currently

  const [form, fields] = useForm<z.input<typeof SignupSchema>>({
    id: 'signup-form',
    constraint: getZodConstraint(SignupSchema),
    lastResult: actionData?.result as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      const result = parseWithZod(formData, {
        schema: SignupSchema,
      });
      return result as any;
    },
    shouldRevalidate: 'onBlur',
  });
  return (
    <div className="container flex flex-col justify-center pb-32 pt-20">
      <div className="text-center">
        <h1 className="text-h1">Let's start your journey!</h1>
        <p className="mt-3 text-body-md text-muted-foreground">
          Please enter your email.
        </p>
      </div>
      <div className="mx-auto mt-16 min-w-full max-w-sm sm:min-w-[368px]">
        <Form method="POST" {...getFormProps(form)}>
          <HoneypotInputs />
          <Field
            labelProps={{
              htmlFor: fields.email.id,
              children: 'Email',
            }}
            inputProps={{
              ...getInputProps(fields.email, {
                type: 'email',
              }),
              autoFocus: true,
              autoComplete: 'email',
            }}
            errors={fields.email.errors}
          />
          <ErrorList errors={form.errors} id={form.errorId} />
          <StatusButton
            className="w-full"
            status={isPending ? 'pending' : (form.status ?? 'idle')}
            type="submit"
            disabled={isPending}
          >
            Submit
          </StatusButton>
          <p className="mt-4 text-center text-body-xs text-muted-foreground">
            By signing up, you agree to our{' '}
            <Link to="/tos" className="underline hover:text-foreground">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </Form>
      </div>
    </div>
  );
};
export default SignupRoute;
export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
