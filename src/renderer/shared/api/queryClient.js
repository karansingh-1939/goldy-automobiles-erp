import { QueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 2 * 60 * 1000, // 2 minutes stale time
    },
    mutations: {
      onError: (error) => {
        const msg = error?.response?.data?.error?.message || error.message || 'Operation failed.';
        useAppStore.getState().addNotification(msg, 'error');
      }
    }
  }
});
