import { useState } from 'react';
import { Button } from './button';
import { Input } from './input';

export function CopyableField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={value}
        onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
      />
      <Button onClick={doCopy}>{copied ? 'Copied' : 'Copy'}</Button>
    </div>
  );
}
