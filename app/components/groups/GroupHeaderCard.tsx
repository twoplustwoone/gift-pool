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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading>{name}</Heading>
          {description ? (
            <div className="text-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex gap-2 self-start">{actions}</div>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
        {stats.map((s, i) => (
          <div
            key={i}
            className="border-subcard-border bg-subcard flex flex-col rounded-xl border p-3 text-center"
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="flex grow items-center justify-center text-base font-semibold">
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
