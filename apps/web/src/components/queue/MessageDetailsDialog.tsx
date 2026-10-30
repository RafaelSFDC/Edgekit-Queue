import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { QueueMessage, DLQMessage } from '../../types';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import { Copy, Terminal, ExternalLink, Calendar, AlertTriangle } from 'lucide-react';

interface MessageDetailsDialogProps {
  message: QueueMessage | DLQMessage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MessageDetailsDialog: React.FC<MessageDetailsDialogProps> = ({
  message,
  open,
  onOpenChange,
}) => {
  if (!message) return null;

  const isDLQ = 'failed_at' in message;

  const handleCopy = (text: string, label: string) => {
    copyToClipboard(text);
    toast.success(`${label} copiado!`);
  };

  let formattedPayload = message.payload;
  try {
    const parsed = JSON.parse(message.payload);
    formattedPayload = JSON.stringify(parsed, null, 2);
  } catch {}

  let formattedHeaders = message.headers;
  try {
    const parsed = JSON.parse(message.headers);
    formattedHeaders = JSON.stringify(parsed, null, 2);
  } catch {}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="size-4 text-pink-500" />
              <span>Inspecionar Mensagem</span>
            </DialogTitle>
            <Badge variant={isDLQ ? 'destructive' : 'secondary'} className="font-mono text-xs">
              {isDLQ ? 'DLQ Failed' : 'Queue Active'}
            </Badge>
          </div>
          <DialogDescription className="font-mono text-xs text-muted-foreground truncate pt-1">
            ID: {message.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          {/* URL & Method */}
          <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Destino:</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => handleCopy(message.url, 'URL')}
              >
                <Copy className="size-3" />
              </Button>
            </div>
            <div className="font-mono text-muted-foreground break-all flex items-center gap-1.5">
              <ExternalLink className="size-3 shrink-0 text-pink-500" />
              <span>{message.url}</span>
            </div>
          </div>

          {/* Error if DLQ */}
          {isDLQ && (message as DLQMessage).error_reason && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-1">
              <div className="flex items-center gap-1.5 text-destructive font-semibold">
                <AlertTriangle className="size-3.5" />
                <span>Motivo da Falha:</span>
              </div>
              <p className="font-mono text-xs text-destructive/90 break-words">
                {(message as DLQMessage).error_reason}
              </p>
            </div>
          )}

          {/* Timestamps & Retries */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-border">
            <div className="space-y-1">
              <span className="text-muted-foreground">Retentativas:</span>
              <p className="font-semibold text-foreground">
                {message.retries} {isDLQ ? 'tentativas esgotadas' : ''}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground">Data do Evento:</span>
              <p className="font-semibold text-foreground flex items-center gap-1">
                <Calendar className="size-3 text-muted-foreground" />
                <span>
                  {new Date(
                    isDLQ ? (message as DLQMessage).failed_at : (message as QueueMessage).created_at
                  ).toLocaleString()}
                </span>
              </p>
            </div>
          </div>

          {/* Payload */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Payload Enviado:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] gap-1 px-2"
                onClick={() => handleCopy(formattedPayload, 'Payload')}
              >
                <Copy className="size-3" />
                <span>Copiar</span>
              </Button>
            </div>
            <pre className="p-3 bg-card border border-border rounded-lg font-mono text-[11px] text-foreground overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
              {formattedPayload || '(vazio)'}
            </pre>
          </div>

          {/* Headers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Headers:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] gap-1 px-2"
                onClick={() => handleCopy(formattedHeaders, 'Headers')}
              >
                <Copy className="size-3" />
                <span>Copiar</span>
              </Button>
            </div>
            <pre className="p-3 bg-card border border-border rounded-lg font-mono text-[11px] text-foreground overflow-x-auto max-h-36 whitespace-pre-wrap break-all">
              {formattedHeaders || '{}'}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
