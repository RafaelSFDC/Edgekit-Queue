import React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, Loader2 } from 'lucide-react';
import { useTheme } from '../../theme/context';

export const Toaster: React.FC<ToasterProps> = ({ theme, ...props }) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={theme ?? resolvedTheme}
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-4 text-emerald-500" />,
        info: <Info className="size-4 text-primary" />,
        warning: <AlertTriangle className="size-4 text-amber-500" />,
        error: <AlertOctagon className="size-4 text-destructive" />,
        loading: <Loader2 className="size-4 animate-spin text-primary" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'bg-card border-border text-foreground text-xs shadow-2xl rounded-xl border flex items-center gap-2',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground text-xs font-semibold rounded-lg',
          cancelButton: 'bg-muted text-muted-foreground text-xs rounded-lg',
        },
      }}
      {...props}
    />
  );
};
