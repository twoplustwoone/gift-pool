import { captureException } from '@sentry/react-router';
import { useEffect } from 'react';
import {
  type ErrorResponse,
  isRouteErrorResponse,
  Link,
  useParams,
  useRouteError,
} from 'react-router';
import { Icon } from '#app/components/ui/icon.tsx';

type StatusHandler = (info: {
  error: ErrorResponse;
  params: Record<string, string | undefined>;
}) => JSX.Element | null;

export const ErrorFallback = ({
  icon,
  title,
  description,
}: {
  icon: 'magnifying-glass' | 'question-mark-circled' | 'lock-closed' | 'clock';
  title: string;
  description?: string;
}) => (
  <div className="flex flex-col items-center gap-4 text-center">
    <Icon name={icon} className="h-10 w-10 text-muted-foreground" />
    <div className="flex flex-col gap-2">
      <h1 className="text-h3">{title}</h1>
      {description ? (
        <p className="text-body-md text-muted-foreground">{description}</p>
      ) : null}
    </div>
    <Link
      to="/"
      className="text-body-md font-medium text-primary underline underline-offset-4"
    >
      Back to home
    </Link>
  </div>
);

export const GeneralErrorBoundary = ({
  defaultStatusHandler = ({ error }) => (
    <ErrorFallback
      icon={error.status === 404 ? 'magnifying-glass' : 'question-mark-circled'}
      title={
        error.status === 404
          ? "We can't find this page"
          : `Something went wrong (${error.status})`
      }
      description={
        typeof error.data === 'string' ? error.data : undefined
      }
    />
  ),
  statusHandlers,
  unexpectedErrorHandler = () => (
    <ErrorFallback
      icon="question-mark-circled"
      title="Something went wrong"
      description="Please try again, or head back home."
    />
  ),
}: {
  defaultStatusHandler?: StatusHandler;
  statusHandlers?: Record<number, StatusHandler>;
  unexpectedErrorHandler?: (error: unknown) => JSX.Element | null;
}) => {
  const error = useRouteError();
  const params = useParams();

  useEffect(() => {
    if (isRouteErrorResponse(error)) {
      return;
    }

    captureException(error);
    if (typeof document !== 'undefined') {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="container flex min-h-[50dvh] items-center justify-center p-8">
      {isRouteErrorResponse(error)
        ? (statusHandlers?.[error.status] ?? defaultStatusHandler)({
            error,
            params,
          })
        : unexpectedErrorHandler(error)}
    </div>
  );
};
