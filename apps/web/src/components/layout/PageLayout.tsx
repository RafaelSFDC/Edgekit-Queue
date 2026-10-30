import React from 'react';
import { cn } from '@/lib/utils';

export interface PageLayoutProps extends React.ComponentProps<'div'> {
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  maxWidth = 'full',
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'w-full min-w-0 flex flex-col gap-6 animate-in fade-in-50 duration-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
