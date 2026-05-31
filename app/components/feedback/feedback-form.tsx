import {
  getFormProps,
  getInputProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { useEffect, useId } from 'react';
import { LuBug, LuCircleCheck, LuLightbulb, LuMessageCircle } from 'react-icons/lu';
import { useFetcher, useLocation } from 'react-router';
import { HoneypotInputs } from 'remix-utils/honeypot/react';
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FeedbackSchema,
  type FeedbackType,
} from '#app/utils/feedback-validation.ts';
import { cn } from '#app/utils/misc.tsx';
import { useOptionalUser } from '#app/utils/user.ts';

const TYPE_OPTIONS: Array<{
  value: FeedbackType;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: 'BUG', label: 'Bug', icon: <LuBug className="h-4 w-4" aria-hidden /> },
  {
    value: 'FEATURE',
    label: 'Idea',
    icon: <LuLightbulb className="h-4 w-4" aria-hidden />,
  },
  {
    value: 'QUESTION',
    label: 'Question',
    icon: <LuMessageCircle className="h-4 w-4" aria-hidden />,
  },
];

type FeedbackFetcherData = {
  result?: SubmissionResult<string[]>;
  ok?: boolean;
};

export const FeedbackForm = ({
  defaultType = 'BUG',
  onSuccess,
  className,
}: {
  defaultType?: FeedbackType;
  onSuccess?: () => void;
  className?: string;
}) => {
  const user = useOptionalUser();
  const location = useLocation();
  const fetcher = useFetcher<FeedbackFetcherData>();
  const formId = useId();
  const isPending = fetcher.state !== 'idle';
  const succeeded = fetcher.state === 'idle' && fetcher.data?.ok === true;

  const [form, fields] = useForm({
    id: `feedback-${formId}`,
    constraint: getZodConstraint(FeedbackSchema),
    lastResult: fetcher.data?.result,
    defaultValue: { type: defaultType },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: FeedbackSchema });
    },
    shouldRevalidate: 'onBlur',
  });

  useEffect(() => {
    if (succeeded) onSuccess?.();
  }, [succeeded, onSuccess]);

  if (succeeded) {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-3 py-8 text-center',
          className,
        )}
        role="status"
      >
        <LuCircleCheck className="h-10 w-10 text-green-500" aria-hidden />
        <p className="text-body-md font-semibold">Thanks for the feedback!</p>
        <p className="text-sm text-muted-foreground">
          We read every message. If you left an email, we&apos;ll be in touch.
        </p>
      </div>
    );
  }

  return (
    <fetcher.Form
      method="POST"
      action="/api/feedback"
      {...getFormProps(form)}
      className={cn('flex flex-col gap-4', className)}
    >
      <HoneypotInputs />
      <input type="hidden" name="pageUrl" value={location.pathname} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          What&apos;s this about?
        </legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {TYPE_OPTIONS.map((option) => {
            const id = `${form.id}-type-${option.value}`;
            return (
              <div key={option.value}>
                <input
                  {...getInputProps(fields.type, { type: 'radio' })}
                  id={id}
                  value={option.value}
                  defaultChecked={fields.type.initialValue === option.value}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-input bg-background px-2 py-3 text-sm font-medium transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-foreground',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                  )}
                >
                  {option.icon}
                  {option.label}
                </Label>
              </div>
            );
          })}
        </div>
        <ErrorList id={fields.type.errorId} errors={fields.type.errors} />
      </fieldset>

      <TextareaField
        labelProps={{ children: 'Your message' }}
        textareaProps={{
          ...getInputProps(fields.message, { type: 'text' }),
          rows: 5,
          maxLength: FEEDBACK_MESSAGE_MAX_LENGTH,
          placeholder:
            'Tell us what happened, what you expected, or what you have in mind…',
        }}
        errors={fields.message.errors}
      />

      {user ? null : (
        <Field
          labelProps={{ children: 'Your email' }}
          inputProps={{
            ...getInputProps(fields.email, { type: 'email' }),
            placeholder: 'you@example.com',
            autoComplete: 'email',
            required: true,
          }}
          errors={fields.email.errors}
        />
      )}

      <ErrorList id={form.errorId} errors={form.errors} />

      <StatusButton
        type="submit"
        status={isPending ? 'pending' : 'idle'}
        disabled={isPending}
        className="w-full"
      >
        Send feedback
      </StatusButton>
    </fetcher.Form>
  );
};
