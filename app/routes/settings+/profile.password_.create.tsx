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
  type LoaderFunctionArgs,
  type ActionFunctionArgs, Form, Link, useActionData 
} from 'react-router';
import { ErrorList, Field } from '#app/components/forms.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { getPasswordHash, requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { useIsPending } from '#app/utils/misc.tsx';
import { PasswordAndConfirmPasswordSchema } from '#app/utils/user-validation.ts';
import { SettingsSubpage } from './__settings-subpage.tsx';
export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};
const CreatePasswordForm = PasswordAndConfirmPasswordSchema;
async function requireNoPassword(userId: string) {
  const password = await prisma.password.findUnique({
    select: {
      userId: true,
    },
    where: {
      userId,
    },
  });
  if (password) {
    throw redirect('/settings/profile/password');
  }
}
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireNoPassword(userId);
  return {};
}
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  await requireNoPassword(userId);
  const formData = await request.formData();
  const submission = await parseWithZod(formData, {
    async: true,
    schema: CreatePasswordForm,
  });
  if (submission.status !== 'success') {
    return data(
      {
        result: submission.reply({
          hideFields: ['password', 'confirmPassword'],
        }),
      },
      {
        status: submission.status === 'error' ? 400 : 200,
      },
    );
  }
  const { password } = submission.value;
  await prisma.user.update({
    select: {
      username: true,
    },
    where: {
      id: userId,
    },
    data: {
      password: {
        create: {
          hash: await getPasswordHash(password),
        },
      },
    },
  });
  return redirect(`/settings/profile`, {
    status: 302,
  });
}
const CreatePasswordRoute = () => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [form, fields] = useForm<{
    password: string;
    confirmPassword: string;
  }>({
    id: 'password-create-form',
    constraint: getZodConstraint(CreatePasswordForm),
    lastResult: actionData?.result as unknown as SubmissionResult<string[]>,
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: CreatePasswordForm,
      }) as any;
    },
    shouldRevalidate: 'onBlur',
  });
  return (
    <SettingsSubpage
      title="Create password"
      description="Set a password so you can sign in without a magic link."
    >
      <Form method="POST" {...getFormProps(form)} className="flex flex-col gap-4">
        <Field
          labelProps={{ children: 'New password' }}
          inputProps={{
            ...getInputProps(fields.password, { type: 'password' }),
            autoComplete: 'new-password',
          }}
          errors={fields.password.errors}
        />
        <Field
          labelProps={{ children: 'Confirm new password' }}
          inputProps={{
            ...getInputProps(fields.confirmPassword, { type: 'password' }),
            autoComplete: 'new-password',
          }}
          errors={fields.confirmPassword.errors}
        />
        <ErrorList id={form.errorId} errors={form.errors} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" asChild>
            <Link to="/settings/profile">Cancel</Link>
          </Button>
          <StatusButton
            type="submit"
            status={isPending ? 'pending' : (form.status ?? 'idle')}
          >
            Create password
          </StatusButton>
        </div>
      </Form>
    </SettingsSubpage>
  );
};
export default CreatePasswordRoute;
