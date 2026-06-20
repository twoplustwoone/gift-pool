import {
  type ActionFunctionArgs,
  type AppLoadContext,
  type LoaderFunctionArgs,
} from 'react-router';

type RouteArgs = {
  context: AppLoadContext;
  params: Record<string, string | undefined>;
  request: Request;
};

export function toActionArgs(args: RouteArgs): ActionFunctionArgs<any> {
  return {
    ...args,
    url: new URL(args.request.url),
    pattern: '',
  } as ActionFunctionArgs<any>;
}

export function toLoaderArgs(args: RouteArgs): LoaderFunctionArgs<any> {
  return {
    ...args,
    url: new URL(args.request.url),
    pattern: '',
  } as LoaderFunctionArgs<any>;
}

export async function getRouteResultData<T>(result: unknown): Promise<T> {
  if (result instanceof Response) {
    return (await result.json()) as T;
  }

  if (
    result &&
    typeof result === 'object' &&
    'data' in result &&
    'init' in result
  ) {
    return (result as { data: T }).data;
  }

  return result as T;
}

export function getRouteResultStatus(result: unknown): number {
  if (result instanceof Response) {
    return result.status;
  }

  if (result && typeof result === 'object' && 'init' in result) {
    return (result as { init?: ResponseInit | null }).init?.status ?? 200;
  }

  return 200;
}
