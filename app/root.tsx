// form utilities are not needed here anymore
import { parseWithZod } from '@conform-to/zod';
import {
  json,
  type LoaderFunctionArgs,
  type HeadersFunction,
  type LinksFunction,
  type MetaFunction,
} from '@remix-run/node';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useFetchers,
  useLoaderData,
} from '@remix-run/react';
import { withSentry } from '@sentry/remix';
import { HoneypotProvider } from 'remix-utils/honeypot/react';
import { z } from 'zod';
import appleTouchIconAssetUrl from './assets/favicons/apple-touch-icon.png';
import faviconAssetUrl from './assets/favicons/favicon.svg';
import { GeneralErrorBoundary } from './components/error-boundary.tsx';
import { Logo } from './components/logo.tsx';
import { BottomNav } from './components/nav/bottom/bottom-nav.tsx';
import { TopBar } from './components/nav/top-bar.tsx';
import { EpicProgress } from './components/progress-bar.tsx';
import { useToast } from './components/toaster.tsx';
import { href as iconsHref } from './components/ui/icon.tsx';
import { EpicToaster } from './components/ui/sonner.tsx';
import nunitoStyleSheet from './styles/nunito-font.css?url';
import tailwindStyleSheetUrl from './styles/tailwind.css?url';
import { getUserId, logout } from './utils/auth.server.ts';
import { ClientHintCheck, getHints, useHints } from './utils/client-hints.tsx';
import { prisma } from './utils/db.server.ts';
import { getEnv } from './utils/env.server.ts';
import { honeypot } from './utils/honeypot.server.ts';
import { combineHeaders, getDomainUrl } from './utils/misc.tsx';
import { useNonce } from './utils/nonce-provider.ts';
import { useRequestInfo } from './utils/request-info.ts';
import { type Theme, getTheme } from './utils/theme.server.ts';
import { makeTimings, time } from './utils/timing.server.ts';
import { getToast } from './utils/toast.server.ts';

export const links: LinksFunction = () => {
  return [
    // Preload svg sprite as a resource to avoid render blocking
    { rel: 'preload', href: iconsHref, as: 'image' },
    {
      rel: 'icon',
      href: '/favicon.ico',
      sizes: '48x48',
    },
    { rel: 'icon', type: 'image/svg+xml', href: faviconAssetUrl },
    { rel: 'apple-touch-icon', href: appleTouchIconAssetUrl },
    {
      rel: 'manifest',
      href: '/site.webmanifest',
      crossOrigin: 'use-credentials',
    } as const, // necessary to make typescript happy
    { rel: 'stylesheet', href: tailwindStyleSheetUrl },
    { rel: 'preload', href: nunitoStyleSheet, as: 'style' },
    { rel: 'stylesheet', href: nunitoStyleSheet },
  ].filter(Boolean);
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data ? 'GiftPool' : 'Error | GiftPool' },
    { name: 'description', content: `Your own captain's log` },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const timings = makeTimings('root loader');
  const userId = await time(() => getUserId(request), {
    timings,
    type: 'getUserId',
    desc: 'getUserId in root',
  });

  const user = userId
    ? await time(
        () =>
          prisma.user.findUniqueOrThrow({
            select: {
              id: true,
              name: true,
              username: true,
              image: { select: { id: true } },
              roles: {
                select: {
                  name: true,
                  permissions: {
                    select: { entity: true, action: true, access: true },
                  },
                },
              },
            },
            where: { id: userId },
          }),
        { timings, type: 'find user', desc: 'find user in root' },
      )
    : null;
  if (userId && !user) {
    console.info('something weird happened');
    // something weird happened... The user is authenticated but we can't find
    // them in the database. Maybe they were deleted? Let's log them out.
    await logout({ request, redirectTo: '/' });
  }
  const { toast, headers: toastHeaders } = await getToast(request);
  const honeyProps = honeypot.getInputProps();

  return json(
    {
      user,
      requestInfo: {
        hints: getHints(request),
        origin: getDomainUrl(request),
        path: new URL(request.url).pathname,
        userPrefs: {
          theme: getTheme(request),
        },
      },
      ENV: getEnv(),
      toast,
      honeyProps,
    },
    {
      headers: combineHeaders(
        { 'Server-Timing': timings.toString() },
        toastHeaders,
      ),
    },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
  const headers = {
    'Server-Timing': loaderHeaders.get('Server-Timing') ?? '',
  };
  return headers;
};

const ThemeFormSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
});

const Document = ({
  children,
  nonce,
  theme = 'light',
  env = {},
}: {
  children: React.ReactNode;
  nonce: string;
  theme?: Theme;
  env?: Record<string, string>;
}) => {
  return (
    <html lang="en" className={`${theme} h-full overflow-x-hidden`}>
      <head>
        <ClientHintCheck nonce={nonce} />
        <Meta />
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,viewport-fit=cover"
        />
        <Links />
      </head>
      <body className="h-full bg-background text-foreground">
        {children}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(env)}`,
          }}
        />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
};

const Footer = () => {
  return (
    <>
      <div className="container hidden justify-between pb-5 sm:flex">
        <Logo />
      </div>
      <div className="sm:hidden">
        <BottomNav />
      </div>
    </>
  );
};

const App = () => {
  const data = useLoaderData<typeof loader>();
  const nonce = useNonce();
  const theme = useTheme();
  useToast(data.toast);

  return (
    <Document nonce={nonce} theme={theme} env={data.ENV}>
      <div className="flex h-dvh min-h-0 flex-col">
        <TopBar />

        <div className="min-h-0 flex-1 sm:overflow-y-auto">
          <Outlet />
        </div>

        <Footer />
      </div>
      <EpicToaster closeButton position="top-center" theme={theme} />
      <EpicProgress />
    </Document>
  );
};

// Mobile dropdown menu replaced by Drawer

const AppWithProviders = () => {
  const data = useLoaderData<typeof loader>();
  return (
    <HoneypotProvider {...data.honeyProps}>
      <App />
    </HoneypotProvider>
  );
};

export default withSentry(AppWithProviders);

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

/**
 * If the user's changing their theme mode preference, this will return the
 * value it's being changed to.
 */
export function useOptimisticThemeMode() {
  const fetchers = useFetchers();
  const themeFetcher = fetchers.find(
    (f) => f.formAction === '/' || f.formAction === '/resources/theme-switch',
  );

  if (themeFetcher && themeFetcher.formData) {
    const submission = parseWithZod(themeFetcher.formData, {
      schema: ThemeFormSchema,
    });
    return submission.status === 'success' ? submission.value.theme : null;
  }
}

export const ErrorBoundary = () => {
  // the nonce doesn't rely on the loader so we can access that
  const nonce = useNonce();

  // NOTE: you cannot use useLoaderData in an ErrorBoundary because the loader
  // likely failed to run so we have to do the best we can.
  // We could probably do better than this (it's possible the loader did run).
  // This would require a change in Remix.

  // Just make sure your root route never errors out and you'll always be able
  // to give the user a better UX.

  return (
    <Document nonce={nonce}>
      <GeneralErrorBoundary />
    </Document>
  );
};
