import { useEffect } from 'react';
import { toast as showToast } from 'sonner';
import type { Toast } from '#app/utils/toast.server.ts';

const displayedToastIds: string[] = [];
const MAX_TRACKED_TOASTS = 50;

export function useToast(toast?: Toast | null) {
  useEffect(() => {
    if (!toast) return;

    const toastId = toast.id ?? JSON.stringify(toast);
    if (displayedToastIds.includes(toastId)) return;

    displayedToastIds.push(toastId);
    if (displayedToastIds.length > MAX_TRACKED_TOASTS) {
      displayedToastIds.shift();
    }

    const timeoutId = setTimeout(() => {
      showToast[toast.type](toast.title, {
        id: toastId,
        description: toast.description,
      });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [toast]);
}

export function resetToastHistory() {
  displayedToastIds.length = 0;
}
