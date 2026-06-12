import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type SEOHandle } from '@nasa-gcn/remix-seo';
import {
  type ActionFunctionArgs,
  Form,
  Link,
  useActionData,
  useSearchParams,
} from 'react-router';
import { HoneypotInputs } from 'remix-utils/honeypot/react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { ErrorList, OTPField } from '#app/components/forms.tsx';
import { Spacer } from '#app/components/spacer.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { checkHoneypot } from '#app/utils/honeypot.server.ts';
import { useIsPending } from '#app/utils/misc.tsx';
import { handleResend, validateRequest } from './verify.server.ts';

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

export const codeQueryParam = 'code';
export const targetQueryParam = 'target';
export const typeQueryParam = 'type';
export const redirectToQueryParam = 'redirectTo';
const types = ['onboarding', 'reset-password', 'change-email', '2fa'] as const;
const VerificationTypeSchema = z.enum(types);
export type VerificationTypes = z.infer<typeof VerificationTypeSchema>;

export const VerifySchema = z.object({
  [codeQueryParam]: z.string().min(6).max(6),
  [typeQueryParam]: VerificationTypeSchema,
  [targetQueryParam]: z.string(),
  [redirectToQueryParam]: z.string().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  await checkHoneypot(formData);
  if (formData.get('intent') === 'resend') {
    return handleResend(request, formData);
  }
  return validateRequest(request, formData);
}

const VerifyRoute = () => {
  const [searchParams] = useSearchParams();
  const isPending = useIsPending();
  const actionData = useActionData<typeof action>();
  const parseWithZoddType = VerificationTypeSchema.safeParse(
    searchParams.get(typeQueryParam),
  );
  const type = parseWithZoddType.success ? parseWithZoddType.data : null;
  const target = searchParams.get(targetQueryParam);

  const checkEmail = (
    <>
      <h1 className="text-h1">Check your email</h1>
      <p className="mt-3 text-body-md text-muted-foreground">
        {/* Echo the address: a typo'd email otherwise means waiting forever
            for a code that never comes, with no clue why. */}
        We've sent a code to{' '}
        {target ? (
          <span className="font-medium text-foreground">{target}</span>
        ) : (
          'your email address'
        )}
        .
      </p>
    </>
  );

  const headings: Record<VerificationTypes, React.ReactNode> = {
    onboarding: checkEmail,
    'reset-password': checkEmail,
    'change-email': checkEmail,
    '2fa': (
      <>
        <h1 className="text-h1">Check your 2FA app</h1>
        <p className="mt-3 text-body-md text-muted-foreground">
          Please enter your 2FA code to verify your identity.
        </p>
      </>
    ),
  };

  const [form, fields] = useForm<z.input<typeof VerifySchema>>({
    id: 'verify-form',
    constraint: getZodConstraint(VerifySchema),
    lastResult: (actionData && 'result' in actionData
      ? actionData.result
      : undefined) as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: VerifySchema }) as any;
    },
    defaultValue: {
      code: searchParams.get(codeQueryParam),
      type: type,
      target: searchParams.get(targetQueryParam),
      redirectTo: searchParams.get(redirectToQueryParam),
    },
  });

  return (
    <main className="container flex flex-col justify-center pb-32 pt-20">
      <div className="text-center">
        {type ? headings[type] : 'Invalid Verification Type'}
      </div>

      <Spacer size="xs" />

      <div className="mx-auto flex w-72 max-w-full flex-col justify-center gap-1">
        <div>
          <ErrorList errors={form.errors} id={form.errorId} />
        </div>
        <div className="flex w-full gap-2">
          <Form method="POST" {...getFormProps(form)} className="flex-1">
            <HoneypotInputs />
            <div className="flex items-center justify-center">
              <OTPField
                labelProps={{
                  htmlFor: fields[codeQueryParam].id,
                  children: 'Code',
                }}
                inputProps={{
                  ...getInputProps(fields[codeQueryParam], { type: 'text' }),
                  autoComplete: 'one-time-code',
                  autoFocus: true,
                }}
                errors={fields[codeQueryParam].errors}
              />
            </div>
            <input
              {...getInputProps(fields[typeQueryParam], { type: 'hidden' })}
            />
            <input
              {...getInputProps(fields[targetQueryParam], { type: 'hidden' })}
            />
            <input
              {...getInputProps(fields[redirectToQueryParam], {
                type: 'hidden',
              })}
            />
            <StatusButton
              className="w-full"
              status={isPending ? 'pending' : (form.status ?? 'idle')}
              type="submit"
              disabled={isPending}
            >
              Submit
            </StatusButton>
          </Form>
        </div>
        {type === 'onboarding' ? (
          <div className="mt-4 space-y-2 text-center text-sm text-muted-foreground">
            {actionData && 'resent' in actionData && actionData.resent ? (
              <p className="text-foreground">
                Code re-sent — give it a minute and check spam too.
              </p>
            ) : (
              <Form method="POST">
                <HoneypotInputs />
                <input type="hidden" name="intent" value="resend" />
                <input type="hidden" name={typeQueryParam} value="onboarding" />
                <input
                  type="hidden"
                  name={targetQueryParam}
                  value={target ?? ''}
                />
                <input
                  type="hidden"
                  name={redirectToQueryParam}
                  value={searchParams.get(redirectToQueryParam) ?? ''}
                />
                <span>Didn't get it? </span>
                <button
                  type="submit"
                  disabled={isPending}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Resend code
                </button>
              </Form>
            )}
            <p>
              <Link
                to={`/signup${
                  searchParams.get(redirectToQueryParam)
                    ? `?redirectTo=${encodeURIComponent(
                        searchParams.get(redirectToQueryParam)!,
                      )}`
                    : ''
                }`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Wrong email? Start over
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
};

export default VerifyRoute;

export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
