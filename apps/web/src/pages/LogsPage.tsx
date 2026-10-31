import React, { useState, useMemo } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useI18n } from '../i18n/context';
import { useGroup } from '../context/group-context';
import { useDeliveryLogsQuery, useClearDeliveryLogsMutation } from '../hooks/api/use-logs';
import {
  Clock,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export const LogsPage: React.FC = () => {
  const { t, locale } = useI18n();
  const { currentGroup } = useGroup();
  const { data: logs = [], isLoading, refetch } = useDeliveryLogsQuery(currentGroup);
  const clearMutation = useClearDeliveryLogsMutation(currentGroup);

  const [search, setSearch] = useState('');

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const term = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.url.toLowerCase().includes(term) ||
        (l.error && l.error.toLowerCase().includes(term)) ||
        (l.status_code && String(l.status_code).includes(term))
    );
  }, [logs, search]);

  const handleClear = () => {
    const confirmMsg =
      locale === 'pt-BR'
        ? `Tem certeza que deseja limpar os logs do grupo "${currentGroup}"?`
        : `Are you sure you want to clear delivery logs for group "${currentGroup}"?`;
    if (window.confirm(confirmMsg)) {
      clearMutation.mutate();
    }
  };

  const getStatusBadge = (log: typeof logs[0]) => {
    if (log.success) {
      return (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1 text-[11px] font-mono"
        >
          <CheckCircle2 className="size-3" />
          <span>{log.status_code || 200} OK</span>
        </Badge>
      );
    }

    if (log.status_code && log.status_code >= 400 && log.status_code < 500) {
      return (
        <Badge
          variant="outline"
          className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1 text-[11px] font-mono"
        >
          <AlertTriangle className="size-3" />
          <span>HTTP {log.status_code}</span>
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className="border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10 gap-1 text-[11px] font-mono"
      >
        <XCircle className="size-3" />
        <span>{log.status_code ? `HTTP ${log.status_code}` : 'Falha'}</span>
      </Badge>
    );
  };

  const formatLatency = (ms: number) => {
    if (ms < 200) {
      return <span className="text-emerald-500 font-mono font-medium">{ms}ms</span>;
    }
    if (ms < 1000) {
      return <span className="text-amber-500 font-mono font-medium">{ms}ms</span>;
    }
    return <span className="text-rose-500 font-mono font-medium">{(ms / 1000).toFixed(2)}s</span>;
  };

  return (
    <PageLayout>
      <PageHeader
        title={locale === 'pt-BR' ? 'Logs de Entrega' : 'Delivery Logs'}
        description={
          locale === 'pt-BR'
            ? `Histórico e auditoria de chamadas de webhooks do grupo: "${currentGroup}"`
            : `History and delivery audit of webhook dispatches for group: "${currentGroup}"`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 text-xs h-8 border-border"
            >
              <RotateCcw className="size-3.5" />
              <span>{t.common.refresh}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={clearMutation.isPending || logs.length === 0}
              className="gap-1.5 text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
            >
              <Trash2 className="size-3.5" />
              <span>{locale === 'pt-BR' ? 'Limpar Logs' : 'Clear Logs'}</span>
            </Button>
          </div>
        }
      />

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale === 'pt-BR' ? 'Filtrar por URL, status...' : 'Filter by URL, status...'}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          {locale === 'pt-BR'
            ? `Total de registros: ${filteredLogs.length}`
            : `Total entries: ${filteredLogs.length}`}
        </div>
      </div>

      {/* Logs Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[120px] text-xs">Status</TableHead>
                <TableHead className="text-xs">Destino / URL</TableHead>
                <TableHead className="w-[80px] text-xs text-center">Método</TableHead>
                <TableHead className="w-[100px] text-xs text-right">Latência</TableHead>
                <TableHead className="w-[80px] text-xs text-center">Tentativas</TableHead>
                <TableHead className="w-[160px] text-xs text-right">Data / Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                    <Clock className="size-4 animate-spin inline-block mr-2" />
                    {t.common.loading}
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-1.5 py-6">
                      <Clock className="size-8 text-muted-foreground/40 stroke-1" />
                      <p className="font-medium text-foreground">
                        {locale === 'pt-BR' ? 'Nenhum log registrado ainda' : 'No delivery logs yet'}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        {locale === 'pt-BR'
                          ? 'Os disparos de webhooks e status de resposta aparecerão aqui em tempo real.'
                          : 'Webhook dispatches and HTTP response outcomes will be audited here in real time.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id} className="text-xs font-mono">
                    <TableCell>{getStatusBadge(log)}</TableCell>
                    <TableCell className="max-w-[320px] truncate">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground truncate" title={log.url}>
                          {log.url}
                        </span>
                        {log.error && (
                          <span className="text-[11px] text-destructive truncate" title={log.error}>
                            {log.error}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                        {log.method || 'POST'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatLatency(log.latency_ms)}</TableCell>
                    <TableCell className="text-center font-mono">
                      {log.retries > 0 ? (
                        <span className="text-amber-500 font-semibold">{log.retries}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                      {new Date(log.delivered_at).toLocaleTimeString(
                        locale === 'pt-BR' ? 'pt-BR' : 'en-US',
                        { hour: '2-digit', minute: '2-digit', second: '2-digit' }
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageLayout>
  );
};
