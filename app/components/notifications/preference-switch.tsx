import { Switch } from '#app/components/ui/switch.tsx';

// Kept for the notification-settings call sites; the primitive now lives in
// `ui/switch.tsx` so other surfaces stop drawing their own toggle.
export function PreferenceSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: Readonly<{
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      label={label}
      onCheckedChange={onCheckedChange}
    />
  );
}
