import React from 'react';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import  { type IconName } from '@/icon-name';

export type ActivityItem = {
  id: string;
  icon: IconName;
  text: string;
  timestamp: string; // preformatted string
};

export const ActivityFeedCard = ({ items, loadMore }: { items: ActivityItem[]; loadMore?: React.ReactNode }) => {
  return (
    <Card padding="lg" data-testid="panel-activity">
      <div className="mb-2 font-semibold">Recent Activity</div>
      <ul className="space-y-2 text-sm">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-2">
            <Icon name={a.icon} className="mt-[2px] text-muted-foreground" />
            <div>
              <div>{a.text}</div>
              <div className="text-xs text-muted-foreground">{a.timestamp}</div>
            </div>
          </li>
        ))}
      </ul>
      {loadMore ? <div className="mt-3">{loadMore}</div> : null}
    </Card>
  );
};
