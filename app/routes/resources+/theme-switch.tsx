import {
  useForm,
  getFormProps,
  type SubmissionResult,
} from '@conform-to/react';
import { parseWithZod } from '@conform-to/zod';
import { invariantResponse } from '@epic-web/invariant';
import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs, redirect, useFetcher, useFetchers 
} from 'react-router';
import { ServerOnly } from 'remix-utils/server-only';
import { z } from 'zod';
import { Icon } from '#app/components/ui/icon.tsx';
import { useHints } from '#app/utils/client-hints.tsx';
import { useRequestInfo } from '#app/utils/request-info.ts';
import { type Theme, setTheme } from '#app/utils/theme.server.ts';
const ThemeFormSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  // this is useful for progressive enhancement
  redirectTo: z.string().optional(),
});
export async function action({ request }: ActionFunctionArgs) {
  invariantResponse(request.method === 'POST', 'Method not allowed', {
    status: 405,
    headers: {
      Allow: 'POST',
    },
  });
  const formData = await request.formData();
  const submission = parseWithZod(formData, {
    schema: ThemeFormSchema,
  });
  invariantResponse(submission.status === 'success', 'Invalid theme received');
  const { theme, redirectTo } = submission.value;
  const responseInit = {
    headers: {
      'set-cookie': setTheme(theme),
    },
  };
  if (redirectTo) {
    return redirect(redirectTo, responseInit);
  } else {
    return data(
      {
        result: submission.reply(),
      },
      responseInit,
    );
  }
}
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== 'GET') {
    return data(
      {
        message: 'Method not allowed',
      },
      {
        status: 405,
        headers: {
          Allow: 'POST',
        },
      },
    );
  }
  return {
    message: 'Submit a POST request to switch themes.',
  };
}
export const ThemeSwitch = ({
  userPreference,
}: {
  userPreference?: Theme | null;
}) => {
  const fetcher = useFetcher<typeof action>();
  const requestInfo = useRequestInfo();
  const [form] = useForm<z.input<typeof ThemeFormSchema>>({
    id: 'theme-switch',
    lastResult: fetcher.data?.result as unknown as SubmissionResult<string[]>,
  });
  const optimisticMode = useOptimisticThemeMode();
  const mode = optimisticMode ?? userPreference ?? 'system';
  const nextMode =
    mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
  const modeLabel = {
    light: (
      <Icon name="sun">
        <span className="sr-only">Light</span>
      </Icon>
    ),
    dark: (
      <Icon name="moon">
        <span className="sr-only">Dark</span>
      </Icon>
    ),
    system: (
      <Icon name="laptop">
        <span className="sr-only">System</span>
      </Icon>
    ),
  };
  return (
    <fetcher.Form
      method="POST"
      {...getFormProps(form)}
      action="/resources/theme-switch"
    >
      <ServerOnly>
        {() => (
          <input type="hidden" name="redirectTo" value={requestInfo.path} />
        )}
      </ServerOnly>
      <input type="hidden" name="theme" value={nextMode} />
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {modeLabel[mode]}
        </button>
      </div>
    </fetcher.Form>
  );
};

/**
 * If the user's changing their theme mode preference, this will return the
 * value it's being changed to.
 */
export function useOptimisticThemeMode() {
  const fetchers = useFetchers();
  const themeFetcher = fetchers.find(
    (f) => f.formAction === '/resources/theme-switch',
  );
  if (themeFetcher && themeFetcher.formData) {
    const submission = parseWithZod(themeFetcher.formData, {
      schema: ThemeFormSchema,
    });
    if (submission.status === 'success') {
      return submission.value.theme;
    }
  }
}

/**
 * @returns the user's theme preference, or the client hint theme if the user
 * has not set a preference.
 */
export function useTheme() {
  const hints = useHints();
  const requestInfo = useRequestInfo();
  const optimisticMode = useOptimisticThemeMode();
  if (optimisticMode) {
    return optimisticMode === 'system' ? hints.theme : optimisticMode;
  }
  return requestInfo.userPrefs.theme ?? hints.theme;
}
