import React, { useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '../i18n/context';
import { useStatsQuery, useTriggerSweepMutation } from '../hooks/api/use-stats';
import { useMessagesQuery } from '../hooks/api/use-messages';
import { PublishMessageDialog } from '../components/queue/PublishMessageDialog';
import { SetKeyDialog } from '../components/queue/SetKeyDialog';
import { MessageDetailsDialog } from '../components/queue/MessageDetailsDialog';
import type { QueueMessage } from '../types';
import { Link } from '@tanstack/react-router';
import {
  Layers,
  Clock,
  AlertOctagon,
  Database,
  Play,
  Send,
  Plus,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Cpu,
} from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const { t } = useI18n();
  const { data: stats, isLoading: statsLoading } = useStatsQuery();
  const { data: messages = [], isLoading: messagesLoading } = useMessagesQuery();
  const sweepMutation = useTriggerSweepMutation();

  const [publishOpen, setPublishOpen] = useState(false);
  const [setKeyOpen, setSetKeyOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<QueueMessage | null>(null);

  const pendingCount = stats?.pending ?? 0;
  const delayedCount = stats?.delayed ?? 0;
  const processingCount = stats?.processing ?? 0;
  const dlqCount = stats?.dlq ?? 0;
  const kvCount = stats?.kvKeysCount ?? 0;

  return (
    <PageLayout>
      {/* 1. Header with quick action buttons */}
      <PageHeader
        title={t.overview.title}
        description={t.overview.subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => sweepMutation.mutate()}
              disabled={sweepMutation.isPending}
              className="gap-1.5 text-xs h-8"
            >
              <Play className="size-3.5 text-pink-500 fill-pink-500" />
              <span>{sweepMutation.isPending ? t.overview.sweepRunning : t.overview.triggerSweep}</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setPublishOpen(true)}
              className="gap-1.5 text-xs h-8 bg-pink-600 hover:bg-pink-700 text-white"
            >
              <Send className="size-3.5" />
              <span>{t.overview.quickPublish}</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSetKeyOpen(true)}
              className="gap-1.5 text-xs h-8"
            >
              <Plus className="size-3.5" />
              <span>{t.overview.quickKv}</span>
            </Button>
          </div>
        }
      />

      {/* 2. Top Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending / Active */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t.overview.pendingMessages}
            </CardTitle>
            <div className="size-8 rounded-lg bg-pink-500/10 text-pink-500 flex items-center justify-center">
              <Layers className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {statsLoading ? '...' : pendingCount + processingCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {processingCount > 0 ? `${processingCount} em entrega ativa` : 'Prontas para entrega'}
            </p>
          </CardContent>
        </Card>

        {/* Delayed / Scheduled */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t.overview.delayedMessages}
            </CardTitle>
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {statsLoading ? '...' : delayedCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Aguardando timer de visibilidade
            </p>
          </CardContent>
        </Card>

        {/* DLQ Count */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t.overview.dlqCount}
            </CardTitle>
            <div
              className={`size-8 rounded-lg flex items-center justify-center ${
                dlqCount > 0
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-emerald-500/10 text-emerald-500'
              }`}
            >
              <AlertOctagon className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono tracking-tight ${
                dlqCount > 0 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {statsLoading ? '...' : dlqCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {dlqCount > 0 ? 'Requer atenção e diagnóstico' : 'Nenhuma falha de entrega'}
            </p>
          </CardContent>
        </Card>

        {/* Redis KV Store */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t.overview.kvCount}
            </CardTitle>
            <div className="size-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Database className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {statsLoading ? '...' : kvCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pares chave-valor persistidos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Recent Queue Activity & Cluster Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Messages table preview */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="size-4 text-pink-500" />
                <span>Mensagens Ativas na Fila</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Últimas tarefas em processamento ou aguardando visibilidade
              </CardDescription>
            </div>
            <Link
              to="/messages"
              className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'text-xs h-7 gap-1' })}
            >
              <span>Ver todas</span>
              <ArrowRight className="size-3" />
            </Link>
          </CardHeader>

          <CardContent className="p-0">
            {messagesLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Carregando tarefas da fila...
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs font-medium text-foreground">Fila Vazia</p>
                <p className="text-[11px] text-muted-foreground">
                  Todas as tarefas foram entregues com sucesso.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {messages.slice(0, 5).map((msg) => {
                  const isScheduled = msg.visibility_at > Date.now();
                  return (
                    <div
                      key={msg.id}
                      onClick={() => setSelectedMessage(msg)}
                      className="p-3 sm:px-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 pr-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground truncate">
                            {msg.id}
                          </span>
                          <Badge
                            variant={isScheduled ? 'secondary' : 'default'}
                            className="text-[10px] py-0 px-1.5"
                          >
                            {isScheduled ? 'Agendada' : 'Pronta'}
                          </Badge>
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground truncate">
                          {msg.url}
                        </p>
                      </div>

                      <div className="shrink-0 text-right space-y-1">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {msg.retries} retries
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cluster Health & Info */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="size-4 text-pink-500" />
              <span>Infraestrutura do Cluster</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Status operacional do SQLite Durable Object
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 bg-muted/30 rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Runtime:</span>
                <span className="font-semibold text-foreground">Cloudflare Workers</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Storage Engine:</span>
                <span className="font-semibold text-foreground">SQLite DO Storage</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Heartbeat Cron:</span>
                <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">
                  * * * * *
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Max Delivery Retries:</span>
                <span className="font-semibold text-foreground">3</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <p className="font-semibold text-foreground">Ações Rápidas</p>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/dlq"
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'sm',
                    className: 'w-full text-xs h-8 justify-start px-2.5',
                  })}
                >
                  <AlertOctagon className="size-3.5 mr-1.5 text-destructive" />
                  <span>Inspecionar DLQ</span>
                </Link>

                <Link
                  to="/redis"
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'sm',
                    className: 'w-full text-xs h-8 justify-start px-2.5',
                  })}
                >
                  <Database className="size-3.5 mr-1.5 text-purple-500" />
                  <span>Ver Chaves KV</span>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <PublishMessageDialog open={publishOpen} onOpenChange={setPublishOpen} />
      <SetKeyDialog open={setKeyOpen} onOpenChange={setSetKeyOpen} />
      <MessageDetailsDialog
        message={selectedMessage}
        open={Boolean(selectedMessage)}
        onOpenChange={(open) => !open && setSelectedMessage(null)}
      />
    </PageLayout>
  );
};
