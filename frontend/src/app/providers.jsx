import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { ThemeSync } from './theme/ThemeSync.jsx';
import { AuthProvider } from '../features/auth/AuthProvider.jsx';
import { SocketProvider } from '../socket/SocketProvider.jsx';
import { ToastProvider } from '../components/ui/Toast.jsx';
import { ErrorBoundary } from '../components/common/ErrorBoundary.jsx';
import { createQueryClient } from './queryClient.js';

export function Providers({ children }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeSync />
            <SocketProvider>
              <ToastProvider>{children}</ToastProvider>
            </SocketProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
