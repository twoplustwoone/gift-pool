import { Card } from '#app/components/ui/card.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import React from 'react';

type QuickStat = { label: string; value: React.ReactNode };

export const GroupHeaderCard = ({
  name,
  description,
  stats,
  actions,
}: {
  name: string;
  description?: string | null;
  stats: QuickStat[];
  actions?: React.ReactNode;
}) => {
  return (
    <Card padding="lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Heading>{name}</Heading>
          {description ? (
            <div className="text-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex gap-2 self-start">{actions}</div> : null}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
        {stats.map((s, i) => (
          <div key={i} className="rounded-xl border border-subcard-border bg-subcard p-3 text-center">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-base font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};
