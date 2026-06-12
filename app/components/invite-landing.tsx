import { Form, Link, useLocation } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';

/**
 * Shared landing layout for invite links (friend / group / pool).
 *
 * The invite context renders BEFORE any auth gate: most invite recipients
 * are brand-new users, and showing them a bare login wall was the single
 * biggest drop-off found by the June 2026 friction audit. Anonymous
 * visitors get "Create account" as the primary action; the join/accept
 * POST itself still requires auth in the route action.
 */
export const InviteLanding = ({
  title,
  isAuthenticated,
  acceptLabel,
  cancelTo,
  cancelLabel = 'Maybe later',
  children,
}: {
  title: string;
  isAuthenticated: boolean;
  /** Omit to render an informational card with no accept action. */
  acceptLabel?: string;
  cancelTo: string;
  cancelLabel?: string;
  children: React.ReactNode;
}) => {
  const location = useLocation();
  const redirectTo = encodeURIComponent(location.pathname);

  return (
    <main className="container flex justify-center pb-24 pt-10 md:pt-20">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          {children}
        </div>
        {isAuthenticated ? (
          <div className="mt-6 flex flex-row justify-end gap-2">
            <Button asChild variant="secondary" className="min-w-28">
              <Link to={cancelTo}>{cancelLabel}</Link>
            </Button>
            {acceptLabel ? (
              <Form method="post" className="inline-block">
                <Button type="submit" className="min-w-28">
                  {acceptLabel}
                </Button>
              </Form>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            <Button asChild className="w-full">
              <Link to={`/signup?redirectTo=${redirectTo}`}>
                Create an account to continue
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/login?redirectTo=${redirectTo}`}>
                I already have one — log in
              </Link>
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
};

/**
 * Friendly dead-link state — shown WITHOUT requiring login first (the
 * audit found users were asked to sign up before learning the link was
 * dead).
 */
export const InviteLandingInvalid = ({
  message = 'This invite link is invalid or has expired.',
}: {
  message?: string;
}) => (
  <main className="container flex justify-center pb-24 pt-10 md:pt-20">
    <Card className="w-full max-w-md p-6">
      <h1 className="text-xl font-semibold">Invite link expired</h1>
      <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask the person who sent it for a fresh link — they can create one in a
        few seconds.
      </p>
      <div className="mt-6">
        <Button asChild variant="outline" className="w-full">
          <Link to="/">Go to GiftPool</Link>
        </Button>
      </div>
    </Card>
  </main>
);
