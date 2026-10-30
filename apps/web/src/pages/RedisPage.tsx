import React, { useState, useMemo } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useI18n } from '../i18n/context';
import {
  useRedisKeysQuery,
  useDeleteRedisKeyMutation,
  useFlushRedisMutation,
} from '../hooks/api/use-redis';
import { executeRedisRawCommand } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../hooks/api/query-keys';
import { SetKeyDialog } from '../components/queue/SetKeyDialog';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Database,
  Plus,
  Trash2,
  Search,
  Copy,
  Pencil,
  Clock,
  CheckCircle2,
  Terminal,
  Play,
  RotateCcw,
} from 'lucide-react';

export const RedisPage: React.FC = () => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: keys = [], isLoading } = useRedisKeysQuery();
  const deleteMutation = useDeleteRedisKeyMutation();
  const flushMutation = useFlushRedisMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<{ key: string; value: string; ttl?: number } | null>(null);
  const [search, setSearch] = useState('');

  // Interactive Redis CLI state
  const [commandInput, setCommandInput] = useState('');
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [commandRunning, setCommandRunning] = useState(false);

  const handleRunCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commandInput.trim()) return;

    // Split arguments respecting quotes
    const matches = commandInput.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (!matches || matches.length === 0) return;
    const args = matches.map((m) => m.replace(/^"|"$/g, ''));

    setCommandRunning(true);
    const start = Date.now();
    try {
      const res = await executeRedisRawCommand(args);
      const latency = Date.now() - start;
      const formatted = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
      setCommandResult(`${formatted}\n// ${latency}ms`);
      const cmd = args[0].toUpperCase();
      if (['SET', 'DEL', 'FLUSHDB', 'FLUSHALL', 'ZADD', 'ZREM', 'ZREMRANGEBYSCORE', 'HSET', 'HDEL', 'LPUSH', 'RPUSH', 'LPOP', 'RPOP'].includes(cmd)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.redis.all });
      }
    } catch (err: any) {
      setCommandResult(`Error: ${err.message}`);
    } finally {
      setCommandRunning(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return keys;
    const term = search.toLowerCase();
    return keys.filter(
      (k) =>
        k.key.toLowerCase().includes(term) ||
        k.value.toLowerCase().includes(term)
    );
  }, [keys, search]);

  const handleFlush = () => {
    if (window.confirm(t.redis.flushConfirm)) {
      flushMutation.mutate();
    }
  };

  const handleCopy = (text: string) => {
    copyToClipboard(text);
    toast.success('Valor copiado!');
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.redis.title}
        description={t.redis.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFlush}
              disabled={flushMutation.isPending || keys.length === 0}
              className="gap-1.5 text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
            >
              <Trash2 className="size-3.5" />
              <span>{t.redis.flushBtn}</span>
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setEditingKey(null);
                setDialogOpen(true);
              }}
              className="gap-1.5 text-xs h-8 bg-pink-600 hover:bg-pink-700 text-white"
            >
              <Plus className="size-3.5" />
              <span>{t.redis.setKeyBtn}</span>
            </Button>
          </div>
        }
      />

      {/* Interactive Redis CLI Console */}
      <Card className="border-border bg-card/60 backdrop-blur-xs">
        <CardHeader className="p-3.5 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-pink-500" />
              <CardTitle className="text-xs font-semibold">Console Interativo Redis / CLI</CardTitle>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              Comandos suportados: GET, SET, ZADD, ZRANGE, HSET, HGETALL, LPUSH, KEYS...
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-3.5 pt-0 space-y-2">
          <form onSubmit={handleRunCommand} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-2.5 text-xs font-mono text-pink-500 font-bold select-none">
                &gt;
              </span>
              <Input
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Ex: SET user:session 12345 EX 3600  ou  ZADD ratelimit 1670000000 req_1"
                className="pl-7 font-mono text-xs h-9 bg-background/80"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={commandRunning || !commandInput.trim()}
              className="gap-1.5 text-xs h-9 bg-pink-600 hover:bg-pink-700 text-white shrink-0"
            >
              <Play className="size-3.5 fill-white" />
              <span>{commandRunning ? 'Executando...' : 'Executar'}</span>
            </Button>
          </form>

          {commandResult !== null && (
            <div className="relative rounded-md bg-muted/70 p-2.5 font-mono text-xs border border-border">
              <div className="flex items-center justify-between pb-1 border-b border-border/50 mb-1.5 text-[10px] text-muted-foreground">
                <span>Resultado:</span>
                <button
                  type="button"
                  onClick={() => setCommandResult(null)}
                  className="hover:text-foreground cursor-pointer"
                >
                  Fechar
                </button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-foreground">
                {commandResult}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="p-4 border-b border-border">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t.redis.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Carregando chaves do Redis...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="size-8 text-purple-500/60 mx-auto" />
              <p className="text-sm font-semibold text-foreground">{t.redis.noKeys}</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {t.redis.noKeysDesc}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[220px]">{t.redis.tableKey}</TableHead>
                    <TableHead className="w-[100px]">{t.redis.tableType}</TableHead>
                    <TableHead className="w-[140px]">{t.redis.tableTtl}</TableHead>
                    <TableHead>{t.redis.tableValue}</TableHead>
                    <TableHead className="w-[120px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.key} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-semibold text-foreground">
                        {item.key}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono py-0">
                          {item.type || 'string'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.ttl && item.ttl > 0 ? (
                          <span className="flex items-center gap-1 text-amber-500 font-semibold">
                            <Clock className="size-3" />
                            <span>{item.ttl}s</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">persistente</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md truncate font-mono text-xs text-muted-foreground">
                          {item.value}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => handleCopy(item.value)}
                            title="Copiar Valor"
                          >
                            <Copy className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => {
                              setEditingKey({
                                key: item.key,
                                value: item.value,
                                ttl: item.ttl > 0 ? item.ttl : undefined,
                              });
                              setDialogOpen(true);
                            }}
                            title="Editar Chave"
                          >
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate(item.key)}
                            disabled={deleteMutation.isPending}
                            title="Excluir Chave"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SetKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialKey={editingKey?.key || ''}
        initialValue={editingKey?.value || ''}
        initialTtl={editingKey?.ttl}
      />
    </PageLayout>
  );
};
