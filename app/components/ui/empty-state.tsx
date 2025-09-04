export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border p-6 text-center text-sm text-muted-foreground">
      <div className="font-medium text-foreground">{title}</div>
      {description ? <div className="mt-1">{description}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

