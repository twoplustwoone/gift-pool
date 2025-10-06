import React from 'react';

// Very lightweight stubs so Remix components/hooks can render inside Storybook

export const Link = React.forwardRef<HTMLAnchorElement, any>(function Link(
  { to, href, children, ...rest },
  ref,
) {
  const resolved =
    href ?? (typeof to === 'string' ? to : (to?.pathname ?? '#'));
  return (
    <a ref={ref} href={resolved} {...rest}>
      {children}
    </a>
  );
});

export const Form: React.FC<React.FormHTMLAttributes<HTMLFormElement>> = (
  props,
) => <form {...props} />;

export function useActionData<T = unknown>(): T | undefined {
  return undefined;
}

export function useRouteLoaderData<T = unknown>(_id?: string): T | undefined {
  return undefined;
}

export type ErrorResponse = { status: number; data: unknown };
export function isRouteErrorResponse(error: any): error is ErrorResponse {
  return (
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as any).status === 'number' &&
    'data' in error
  );
}
export function useRouteError(): unknown {
  return undefined;
}

export function useLoaderData<T = unknown>(): T | undefined {
  return undefined;
}

export function useFormAction(): string {
  return '';
}

export function useNavigation(): any {
  return { state: 'idle', formAction: undefined, formMethod: undefined };
}

export function useFetcher(): any {
  const FetcherForm: React.FC<React.FormHTMLAttributes<HTMLFormElement>> = (
    props,
  ) => <form {...props} />;
  return {
    Form: FetcherForm,
    submit: () => {},
    state: 'idle',
    data: undefined,
  };
}

export function useParams<TParams extends Record<string, string>>(): TParams {
  return {} as TParams;
}

export function useSearchParams(): [URLSearchParams, (next: any) => void] {
  const sp = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  return [sp, () => {}];
}

export function useLocation() {
  if (typeof window === 'undefined')
    return { pathname: '/', search: '', hash: '', state: null, key: 'sb' };
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    state: null,
    key: 'sb',
  };
}

export function useNavigate(): (to: string | number, opts?: any) => void {
  return () => {};
}

export function useMatches(): Array<any> {
  return [];
}

export function Outlet() {
  return null;
}
