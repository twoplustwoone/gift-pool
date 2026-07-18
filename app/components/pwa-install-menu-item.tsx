import { LuDownload } from 'react-icons/lu';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  type InstallOutcome,
  type UsePwaInstallPromptReturn,
} from '#app/hooks/use-pwa-install-prompt.ts';
import { DropdownMenuItem } from './ui/dropdown-menu.tsx';
import { Flex, Text } from './ui-kit/index.ts';

const showInstallOutcome = (outcome: InstallOutcome) => {
  if (outcome === 'accepted') {
    toast.success('GiftPool installed', {
      description: 'You can now launch it from your Home Screen.',
    });
  } else if (outcome === 'dismissed') {
    toast.info('Install dismissed', {
      description: 'You can install later from your account menu.',
    });
  } else if (outcome === 'unavailable') {
    toast.error('Install not available', {
      description: 'Your browser did not expose an install option.',
    });
  } else if (outcome === 'error') {
    toast.error('Install failed', {
      description: 'Something went wrong. Please try again.',
    });
  }
};

export type PwaInstallMenuItemProps = UsePwaInstallPromptReturn;

export const PwaInstallMenuItem = ({
  capability,
  isInstalled,
  isPrompting,
  manualPlatform,
  promptInstall,
}: PwaInstallMenuItemProps) => {
  if (isInstalled || capability === 'unsupported') return null;

  const content = (
    <Flex gap={2}>
      <LuDownload className="h-3 w-3" />
      <Text>Install app</Text>
    </Flex>
  );

  if (capability === 'manual') {
    const platformQuery = manualPlatform ? `?platform=${manualPlatform}` : '';
    return (
      <DropdownMenuItem asChild>
        <Link prefetch="intent" to={`/pwa-install${platformQuery}`}>
          {content}
        </Link>
      </DropdownMenuItem>
    );
  }

  const handleInstall = async () => {
    try {
      showInstallOutcome(await promptInstall());
    } catch {
      showInstallOutcome('error');
    }
  };

  return (
    <DropdownMenuItem asChild disabled={isPrompting}>
      <button
        type="button"
        className="w-full text-left"
        disabled={isPrompting}
        onClick={() => void handleInstall()}
      >
        {content}
      </button>
    </DropdownMenuItem>
  );
};
