import { type ErrorInfo } from 'react';

export type RootErrorHandler = (error: unknown, errorInfo: ErrorInfo) => void;

// Hydration errors can fire before the lazy Sentry chunk arrives; hold them so
// they reach Sentry, with their component stack, once it has initialized.
export function createRootErrorReporter() {
  let report: RootErrorHandler | undefined;
  const pending: Parameters<RootErrorHandler>[] = [];

  const onRootError: RootErrorHandler = (error, errorInfo) => {
    if (report) report(error, errorInfo);
    else pending.push([error, errorInfo]);
  };

  const connect = (handler: RootErrorHandler) => {
    report = handler;
    for (const args of pending.splice(0)) handler(...args);
  };

  return { onRootError, connect };
}
