import { useEffect } from 'react';
import { toast as showToast } from 'sonner';

type Toast = {
  description: string;
  id: string;
  title?: string;
  type: 'message' | 'success' | 'error';
};

export function useToast(toast?: Toast | null) {
  useEffect(() => {
    if (toast) {
      setTimeout(() => {
        showToast[toast.type](toast.title, {
          id: toast.id,
          description: toast.description,
        });
      }, 0);
    }
  }, [toast]);
}
