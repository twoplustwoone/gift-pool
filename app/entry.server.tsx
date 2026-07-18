import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';

import * as Sentry from '@sentry/react-router';
import chalk from 'chalk';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import {
  isRouteErrorResponse,
  ServerRouter,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type HandleDocumentRequestFunction,
} from 'react-router';
import { cspNonceContext } from '../server/react-router-context.ts';
import { getEnv, init } from './utils/env.server.ts';
import { getInstanceInfo } from './utils/litefs.server.ts';
import { NonceProvider } from './utils/nonce-provider.ts';
import { makeTimings } from './utils/timing.server.ts';

export const streamTimeout = 5000;
const ABORT_DELAY = streamTimeout + 1000;

init();
global.ENV = getEnv();

type DocRequestArgs = Parameters<HandleDocumentRequestFunction>;

export default async function handleRequest(...args: DocRequestArgs) {
  const [
    request,
    responseStatusCode,
    responseHeaders,
    reactRouterContext,
    loadContext,
  ] = args;
  const { currentInstance, primaryInstance } = await getInstanceInfo();
  responseHeaders.set('fly-region', process.env.FLY_REGION ?? 'unknown');
  responseHeaders.set('fly-app', process.env.FLY_APP_NAME ?? 'unknown');
  // Internal LiteFS machine ids are useful for local/debug diagnostics but
  // needlessly disclose deployment topology (which instance is primary) to
  // every client in production — expose them off-prod only.
  if (process.env.NODE_ENV !== 'production') {
    responseHeaders.set('fly-primary-instance', primaryInstance);
    responseHeaders.set('fly-instance', currentInstance);
  }

  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    responseHeaders.append('Document-Policy', 'js-profiling');
  }

  const callbackName = isbot(request.headers.get('user-agent'))
    ? 'onAllReady'
    : 'onShellReady';

  const nonce = loadContext.get(cspNonceContext) ?? '';
  return new Promise((resolve, reject) => {
    let didError = false;
    // NOTE: this timing will only include things that are rendered in the shell
    // and will not include suspended components and deferred loaders
    const timings = makeTimings('render', 'renderToPipeableStream');

    const { pipe, abort } = renderToPipeableStream(
      <NonceProvider value={nonce}>
        <ServerRouter context={reactRouterContext} url={request.url} />
      </NonceProvider>,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          responseHeaders.set('Content-Type', 'text/html');
          responseHeaders.append('Server-Timing', timings.toString());
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: didError ? 500 : responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError: (err: unknown) => {
          reject(err);
        },
        onError: () => {
          didError = true;
        },
        nonce,
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

export async function handleDataRequest(response: Response) {
  const { currentInstance, primaryInstance } = await getInstanceInfo();
  response.headers.set('fly-region', process.env.FLY_REGION ?? 'unknown');
  response.headers.set('fly-app', process.env.FLY_APP_NAME ?? 'unknown');
  // See handleRequest: internal instance ids are diagnostics only, not for
  // production clients.
  if (process.env.NODE_ENV !== 'production') {
    response.headers.set('fly-primary-instance', primaryInstance);
    response.headers.set('fly-instance', currentInstance);
  }

  return response;
}

export function handleError(
  error: unknown,
  { request }: LoaderFunctionArgs | ActionFunctionArgs,
): void {
  // Skip capturing if the request was aborted.
  if (request.signal.aborted) {
    return;
  }
  // Router-internal client errors are not app failures — e.g. a scanner URL
  // with encoded newlines matches no route (not even the splat, whose regex
  // can't cross newlines) and surfaces here as an internal 404 ErrorResponse.
  if (isRouteErrorResponse(error) && error.status < 500) {
    console.warn(
      chalk.yellow(
        `Client error ${error.status} for ${request.method} ${request.url}: ${error.data}`,
      ),
    );
    return;
  }
  if (error instanceof Error) {
    console.error(chalk.red(error.stack));
  } else {
    console.error(chalk.red(error));
  }
  Sentry.captureException(error);
}
