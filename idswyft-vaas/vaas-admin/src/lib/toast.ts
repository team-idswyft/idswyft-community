import toast from 'react-hot-toast';

/**
 * Project-styled toast wrappers.
 * Global styling is set by the <Toaster> in App.tsx — these just provide
 * typed convenience methods so callers don't import react-hot-toast directly.
 */
export const showToast = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast(message, { icon: '\u2139\uFE0F' }),
};
