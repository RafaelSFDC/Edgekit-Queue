import React, { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '../lib/query-client';
import { I18nProvider } from '../i18n/context';
import { ThemeProvider } from '../theme/context';
import { AuthProvider } from '../context/auth-context';
import { GroupProvider } from '../context/group-context';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from './ui/sonner';

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <GroupProvider>
              <TooltipProvider delay={200}>
                {children}
                <Toaster position="bottom-right" richColors />
                {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
              </TooltipProvider>
            </GroupProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
