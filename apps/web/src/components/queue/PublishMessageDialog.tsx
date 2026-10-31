import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePublishMessageMutation } from '../../hooks/api/use-messages';
import { Send, Clock, RotateCcw } from 'lucide-react';

interface PublishMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PublishMessageDialog: React.FC<PublishMessageDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const [url, setUrl] = useState('');
  const [payload, setPayload] = useState('{\n  "event": "user.signup",\n  "userId": 123\n}');
  const [delay, setDelay] = useState('');
  const [retries, setRetries] = useState('3');
  const [method, _setMethod] = useState('POST');

  const publishMutation = usePublishMessageMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    let parsedPayload: any = payload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {}

    await publishMutation.mutateAsync({
      url: url.trim(),
      payload: parsedPayload,
      delay: delay.trim() || undefined,
      retries: retries ? parseInt(retries, 10) : undefined,
      method,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4 text-pink-500" />
            <span>Publicar Mensagem na Fila</span>
          </DialogTitle>
          <DialogDescription>
            Envie uma tarefa HTTP assíncrona com suporte a atraso (delay) e retentativas automáticas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dest-url">URL de Destino (Webhook / Endpoint)</Label>
            <Input
              id="dest-url"
              placeholder="https://meusite.com/api/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="msg-delay" className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground" />
                <span>Atraso (Delay)</span>
              </Label>
              <Input
                id="msg-delay"
                placeholder="ex: 10s, 5m, 2h"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="msg-retries" className="flex items-center gap-1.5">
                <RotateCcw className="size-3.5 text-muted-foreground" />
                <span>Max Retries</span>
              </Label>
              <Input
                id="msg-retries"
                type="number"
                min="0"
                max="10"
                value={retries}
                onChange={(e) => setRetries(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="msg-payload">Payload (JSON ou Texto)</Label>
            <Textarea
              id="msg-payload"
              rows={5}
              className="font-mono text-xs"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={publishMutation.isPending || !url.trim()}
              className="bg-pink-600 hover:bg-pink-700 text-white gap-2"
            >
              <Send className="size-3.5" />
              <span>{publishMutation.isPending ? 'Enviando...' : 'Publicar'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
