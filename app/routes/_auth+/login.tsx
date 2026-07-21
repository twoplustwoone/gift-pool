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
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  Form,
  Link,
  useActionData,
  useSearchParams,
} from 'react-router';
import { HoneypotInputs } from 'remix-utils/honeypot/react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx';
import { CheckboxField, ErrorList, Field } from '#app/components/forms.tsx';
import { Spacer } from '#app/components/spacer.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { login, requireAnonymous } from '#app/utils/auth.server.ts';
import { checkHoneypot } from '#app/utils/honeypot.server.ts';
import { useIsPending } from '#app/utils/misc.tsx';
import { UsernameSchema } from '#app/utils/user-validation.ts';
import { handleNewSession } from './login.server.ts';
export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};
const LoginFormSchema = z.object({
  username: UsernameSchema,
  // Presence-only on login: signup's min-length rule must not lock out
  // accounts whose password predates a stricter policy (June 2026 audit).
  // Whether the password is RIGHT is the server's job, not the schema's.
  password: z.string({ required_error: 'Password is required' }),
  redirectTo: z.string().optional(),
  remember: z.boolean().optional(),
});
export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  return {};
}
export async function action({ request }: ActionFunctionArgs) {
  await requireAnonymous(request);
  const formData = await request.formData();
  await checkHoneypot(formData);
  const submission = await parseWithZod(formData, {
    schema: (intent) =>
      LoginFormSchema.transform(async (data, ctx) => {
        if (intent !== null)
          return {
            ...data,
            session: null,
          };
        const session = await login(data);
        if (!session) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid username or password',
          });
          return z.NEVER;
        }
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
        result: submission.reply({
          hideFields: ['password'],
        }),
      },
      {
        status: submission.status === 'error' ? 400 : 200,
      },
    );
  }
  const { session, remember, redirectTo } = submission.value;
  return handleNewSession({
    request,
    session,
    remember: remember ?? false,
    redirectTo,
  });
}
const LoginPage = () => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const [form, fields] = useForm<z.input<typeof LoginFormSchema>>({
    id: 'login-form',
    constraint: getZodConstraint(LoginFormSchema),
    defaultValue: {
      redirectTo,
    },
    lastResult: actionData?.result as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: LoginFormSchema,
      }) as any;
    },
    shouldRevalidate: 'onBlur',
  });
  return (
    <div className="flex min-h-full flex-col justify-center pb-32 pt-20">
      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="text-h1">Welcome back!</h1>
          <p className="text-body-md text-muted-foreground">
            Please enter your details.
          </p>
        </div>
        <Spacer size="xs" />

        <div>
          <div className="mx-auto w-full max-w-md px-8">
            <Form
              method="POST"
              {...getFormProps(form)}
              className="flex flex-col gap-4"
            >
              <HoneypotInputs />
              <Field
                labelProps={{
                  children: 'Username',
                }}
                inputProps={{
                  ...getInputProps(fields.username, {
                    type: 'text',
                  }),
                  autoFocus: true,
                  className: 'lowercase',
                  autoComplete: 'username',
                }}
                errors={fields.username.errors}
              />

              <Field
                labelProps={{
                  children: 'Password',
                }}
                inputProps={{
                  ...getInputProps(fields.password, {
                    type: 'password',
                  }),
                  autoComplete: 'current-password',
                }}
                errors={fields.password.errors}
              />

              <div className="flex justify-between">
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
                <div>
                  <Link
                    to="/forgot-password"
                    className="text-body-xs font-semibold"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <input
                {...getInputProps(fields.redirectTo, {
                  type: 'hidden',
                })}
              />
              <ErrorList errors={form.errors} id={form.errorId} />

              <div className="flex items-center justify-between gap-6">
                <StatusButton
                  className="w-full"
                  status={isPending ? 'pending' : (form.status ?? 'idle')}
                  type="submit"
                  disabled={isPending}
                >
                  Log in
                </StatusButton>
              </div>
            </Form>

            <div className="flex items-center justify-center gap-2 pt-6">
              <span className="text-muted-foreground">New here?</span>
              <Link
                to={
                  redirectTo
                    ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}`
                    : '/signup'
                }
              >
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
export const meta: MetaFunction = () => {
  return [
    {
      title: 'Login to GiftPool',
    },
  ];
};
export const ErrorBoundary = () => {
  return <GeneralErrorBoundary />;
};
