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
import { useGroup } from '../context/group-context';
import {
  useMessagesQuery,
  useDeleteMessageMutation,
  usePurgeMessagesMutation,
} from '../hooks/api/use-messages';
import { PublishMessageDialog } from '../components/queue/PublishMessageDialog';
import { MessageDetailsDialog } from '../components/queue/MessageDetailsDialog';
import type { QueueMessage } from '../types';
import {
  Layers,
  Send,
  Trash2,
  Search,
  Clock,
  Eye,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const MessagesPage: React.FC = () => {
  const { t } = useI18n();
  const { currentGroup } = useGroup();
  const { data: messages = [], isLoading, refetch } = useMessagesQuery(currentGroup);
  const deleteMutation = useDeleteMessageMutation(currentGroup);
  const purgeMutation = usePurgeMessagesMutation(currentGroup);

  const [publishOpen, setPublishOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<QueueMessage | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'ready'>('all');

  const filteredMessages = useMemo(() => {
    const now = Date.now();
    return messages.filter((msg) => {
      const isScheduled = msg.visibility_at > now;
      if (filter === 'scheduled' && !isScheduled) return false;
      if (filter === 'ready' && isScheduled) return false;

      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        msg.id.toLowerCase().includes(term) ||
        msg.url.toLowerCase().includes(term)
      );
    });
  }, [messages, filter, search]);

  const handlePurge = () => {
    if (window.confirm(t.messages.purgeConfirm)) {
      purgeMutation.mutate();
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.messages.title}
        description={t.messages.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurge}
              disabled={purgeMutation.isPending || messages.length === 0}
              className="gap-1.5 text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
            >
              <Trash2 className="size-3.5" />
              <span>{t.messages.purgeBtn}</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setPublishOpen(true)}
              className="gap-1.5 text-xs h-8 bg-pink-600 hover:bg-pink-700 text-white"
            >
              <Send className="size-3.5" />
              <span>{t.messages.publishBtn}</span>
            </Button>
          </div>
        }
      />

      <Card className="border-border">
        <CardHeader className="p-4 border-b border-border space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t.messages.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg text-xs font-medium self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'all'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.messages.filterAll} ({messages.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('scheduled')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'scheduled'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.messages.filterScheduled}
              </button>
              <button
                type="button"
                onClick={() => setFilter('ready')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'ready'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Prontas
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Carregando mensagens da fila...
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="size-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-semibold text-foreground">{t.messages.noMessages}</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {t.messages.noMessagesDesc}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[180px]">{t.messages.tableId}</TableHead>
                    <TableHead>{t.messages.tableUrl}</TableHead>
                    <TableHead className="w-[120px]">{t.messages.tableStatus}</TableHead>
                    <TableHead className="w-[150px]">{t.messages.tableScheduled}</TableHead>
                    <TableHead className="w-[100px] text-center">{t.messages.tableRetries}</TableHead>
                    <TableHead className="w-[120px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((msg) => {
                    const now = Date.now();
                    const isScheduled = msg.visibility_at > now;
                    const diffSeconds = Math.max(0, Math.round((msg.visibility_at - now) / 1000));

                    return (
                      <TableRow key={msg.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-semibold text-foreground">
                          {msg.id}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-md truncate font-mono text-xs text-muted-foreground">
                            {msg.url}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isScheduled ? 'secondary' : 'default'}
                            className="text-[10px] py-0 px-2 font-medium"
                          >
                            {isScheduled ? 'Agendada' : 'Pronta'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {isScheduled ? (
                            <span className="flex items-center gap-1 text-amber-500 font-semibold">
                              <Clock className="size-3" />
                              <span>em {diffSeconds}s</span>
                            </span>
                          ) : (
                            <span>Imediata</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {msg.retries} / {msg.max_retries}
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
                              className="size-7 text-destructive hover:bg-destructive/10"
                              onClick={() => deleteMutation.mutate(msg.id)}
                              disabled={deleteMutation.isPending}
                              title="Cancelar Tarefa"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PublishMessageDialog open={publishOpen} onOpenChange={setPublishOpen} />
      <MessageDetailsDialog
        message={selectedMessage}
        open={Boolean(selectedMessage)}
        onOpenChange={(open) => !open && setSelectedMessage(null)}
      />
    </PageLayout>
  );
};
