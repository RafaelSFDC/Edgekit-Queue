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
import { useSetRedisKeyMutation } from '../../hooks/api/use-redis';
import { Database, Clock } from 'lucide-react';

interface SetKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKey?: string;
  initialValue?: string;
  initialTtl?: number;
}

export const SetKeyDialog: React.FC<SetKeyDialogProps> = ({
  open,
  onOpenChange,
  initialKey = '',
  initialValue = '',
  initialTtl,
}) => {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState(initialValue);
  const [ttl, setTtl] = useState(initialTtl && initialTtl > 0 ? String(initialTtl) : '');

  const setKeyMutation = useSetRedisKeyMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    await setKeyMutation.mutateAsync({
      key: key.trim(),
      value,
      ttl: ttl.trim() ? parseInt(ttl, 10) : undefined,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="size-4 text-pink-500" />
            <span>Salvar Chave no Redis KV</span>
          </DialogTitle>
          <DialogDescription>
            Defina uma chave, valor (JSON, texto ou objeto) e expiração opcional em segundos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kv-key">Chave (Key)</Label>
            <Input
              id="kv-key"
              placeholder="ex: user:123:session ou config:app"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kv-ttl" className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>TTL em Segundos (Opcional - deixe vazio para persistente)</span>
            </Label>
            <Input
              id="kv-ttl"
              type="number"
              placeholder="ex: 3600 (1 hora)"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kv-value">Valor (String ou JSON)</Label>
            <Textarea
              id="kv-value"
              rows={5}
              className="font-mono text-xs"
              placeholder="Conteúdo do valor..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
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
              disabled={setKeyMutation.isPending || !key.trim()}
              className="bg-pink-600 hover:bg-pink-700 text-white gap-2"
            >
              <span>{setKeyMutation.isPending ? 'Salvando...' : 'Salvar Chave'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
