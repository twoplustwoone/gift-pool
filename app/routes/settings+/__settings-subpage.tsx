import { Link } from 'react-router';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';

// Shared shell for settings sub-pages (change-email, password, two-factor,
// etc.). Gives each leaf form a consistent back-link, title, optional
// description, and card container so they stop looking like naked h1 + form
// after the layout-level card was removed in the hub revamp.
type SettingsSubpageProps = Readonly<{
  title: string;
  description?: string;
  children: React.ReactNode;
  backTo?: string;
  backLabel?: string;
}>;

export function SettingsSubpage({
  title,
  description,
  children,
  backTo = '/settings/profile',
  backLabel = 'Back to settings',
}: SettingsSubpageProps) {
  return (
    <div className="flex flex-col gap-5">
      <Link
        to={backTo}
        prefetch="intent"
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <Icon name="arrow-left" className="h-3 w-3" aria-hidden />
        {backLabel}
      </Link>

      <div className="flex flex-col gap-1">
        <Text
          as="h1"
          size="2xl"
          weight="semibold"
          className="text-foreground"
        >
          {title}
        </Text>
        {description ? (
          <Text size="sm" className="text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </div>

      <Card padding="lg">{children}</Card>
    </div>
  );
}
