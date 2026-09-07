import { Link } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { EmptyState } from '#app/components/ui/empty-state.tsx';

// The two sanctioned homes of the phrase "Secret Santa": setup and empty
// states. It never appears in a running exchange.
export function ExchangeEmptyState({
  variant,
  groupName,
  groupId,
}: Readonly<
  | { variant: 'group'; groupName: string; groupId: string }
  | { variant: 'list'; groupName?: undefined; groupId?: undefined }
>) {
  if (variant === 'group') {
    return (
      <EmptyState
        title={`${groupName} hasn't done one yet`}
        description="Everyone draws one person and gives to them in secret. A Secret Santa for any occasion — and Gift Pool keeps the record afterwards."
        action={
          <Button asChild>
            <Link to={`/exchanges/new?groupId=${groupId}`}>
              Start an exchange
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      title="No exchanges yet"
      description="Start one with a group you're already in, or make a standalone one and send a link to whoever you like."
      action={
        <div className="flex flex-col items-center gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/exchanges/new">Start an exchange</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/groups">See your groups</Link>
          </Button>
        </div>
      }
    />
  );
}
