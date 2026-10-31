import React, { useState, useMemo } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
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
import {
  useDLQQuery,
  useRetryDLQMutation,
  useDeleteDLQMutation,
  usePurgeDLQMutation,
} from '../hooks/api/use-dlq';
import { MessageDetailsDialog } from '../components/queue/MessageDetailsDialog';
import type { DLQMessage } from '../types';
import {
  RotateCcw,
  Trash2,
  Search,
  Eye,
  CheckCircle2,
} from 'lucide-react';

export const DlqPage: React.FC = () => {
  const { t } = useI18n();
  const { currentGroup } = useGroup();
  const { data: dlqMessages = [], isLoading } = useDLQQuery(currentGroup);
  const retryMutation = useRetryDLQMutation(currentGroup);
  const deleteMutation = useDeleteDLQMutation(currentGroup);
  const purgeMutation = usePurgeDLQMutation(currentGroup);

  const [selectedMessage, setSelectedMessage] = useState<DLQMessage | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return dlqMessages;
    const term = search.toLowerCase();
    return dlqMessages.filter(
      (m) =>
        m.id.toLowerCase().includes(term) ||
        m.url.toLowerCase().includes(term) ||
        m.error_reason.toLowerCase().includes(term)
    );
  }, [dlqMessages, search]);

  const handlePurge = () => {
    if (window.confirm(t.dlq.purgeConfirm)) {
      purgeMutation.mutate();
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.dlq.title}
        description={t.dlq.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurge}
              disabled={purgeMutation.isPending || dlqMessages.length === 0}
              className="gap-1.5 text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
            >
              <Trash2 className="size-3.5" />
              <span>{t.dlq.purgeBtn}</span>
            </Button>
          </div>
        }
      />

      <Card className="border-border">
        <CardHeader className="p-4 border-b border-border">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por ID, URL ou erro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Carregando mensagens da DLQ...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="size-8 text-emerald-500/60 mx-auto" />
              <p className="text-sm font-semibold text-foreground">{t.dlq.noDlq}</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {t.dlq.noDlqDesc}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[180px]">{t.dlq.tableId}</TableHead>
                    <TableHead>{t.dlq.tableUrl}</TableHead>
                    <TableHead>{t.dlq.tableError}</TableHead>
                    <TableHead className="w-[150px]">{t.dlq.tableFailedAt}</TableHead>
                    <TableHead className="w-[140px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((msg) => (
                    <TableRow key={msg.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-semibold text-foreground">
                        {msg.id}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                          {msg.url}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md truncate text-xs text-destructive font-mono">
                          {msg.error_reason || 'Desconhecido'}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(msg.failed_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setSelectedMessage(msg)}
                            title="Inspecionar"
                          >
                            <Eye className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-pink-600 hover:bg-pink-500/10"
                            onClick={() => retryMutation.mutate(msg.id)}
                            disabled={retryMutation.isPending}
                            title="Reprocessar Mensagem"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate(msg.id)}
                            disabled={deleteMutation.isPending}
                            title="Excluir Permanentemente"
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

      <MessageDetailsDialog
        message={selectedMessage}
        open={Boolean(selectedMessage)}
        onOpenChange={(open) => !open && setSelectedMessage(null)}
      />
    </PageLayout>
  );
};
