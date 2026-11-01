import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CalendarClock,
  Plus,
  Play,
  Pause,
  Trash2,
  Clock,
  Zap,
} from 'lucide-react';
import { useI18n } from '../i18n/context';
import {
  fetchSchedules,
  createSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  triggerScheduleNow,
} from '../services/api';
import { toast } from 'sonner';
import type { Schedule } from '../types';

export const SchedulesPage: React.FC = () => {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [cron, setCron] = useState('*/5 * * * *');
  const [url, setUrl] = useState('');
  const [payload, setPayload] = useState('{\n  "event": "cron.heartbeat"\n}');
  const [priority, setPriority] = useState<number>(0);

  const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ['schedules', 'default'],
    queryFn: () => fetchSchedules('default'),
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      toast.success(t.schedules.createSuccess);
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setCreateDialogOpen(false);
      setUrl('');
      setCron('*/5 * * * *');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao criar agendamento');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSchedule(id, 'default'),
    onSuccess: () => {
      toast.success(t.schedules.deleteSuccess);
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  const togglePauseMutation = useMutation({
    mutationFn: async ({ id, isPaused }: { id: string; isPaused: boolean }) => {
      if (isPaused) {
        return resumeSchedule(id, 'default');
      }
      return pauseSchedule(id, 'default');
    },
    onSuccess: (_, vars) => {
      toast.success(vars.isPaused ? t.schedules.resumeSuccess : t.schedules.pauseSuccess);
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => triggerScheduleNow(id, 'default'),
    onSuccess: () => {
      toast.success(t.schedules.triggerSuccess);
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cron.trim() || !url.trim()) return;

    let parsedPayload: any = payload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {}

    createMutation.mutate({
      cron: cron.trim(),
      url: url.trim(),
      payload: parsedPayload,
      groupId: 'default',
      priority,
    });
  };

  const presets = [
    { label: 'A cada 1 min', cron: '* * * * *' },
    { label: 'A cada 5 min', cron: '*/5 * * * *' },
    { label: 'A cada hora', cron: '@hourly' },
    { label: 'Diário (00:00)', cron: '@daily' },
    { label: 'Dias úteis 9h', cron: '0 9 * * 1-5' },
  ];

  return (
    <PageLayout>
      <PageHeader
        title={t.schedules.title}
        description={t.schedules.subtitle}
      >
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-pink-600 hover:bg-pink-700 text-white gap-2 shadow-xs text-xs font-semibold h-9"
        >
          <Plus className="size-4" />
          <span>{t.schedules.createBtn}</span>
        </Button>
      </PageHeader>

      <Card className="border-border">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-pink-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agendamentos Ativos ({schedules.length})
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">
              Carregando agendamentos...
            </div>
          ) : schedules.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Clock className="size-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-semibold text-foreground">{t.schedules.noSchedules}</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {t.schedules.noSchedulesDesc}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[140px]">{t.schedules.tableId}</TableHead>
                    <TableHead className="w-[140px]">{t.schedules.tableCron}</TableHead>
                    <TableHead>{t.schedules.tableUrl}</TableHead>
                    <TableHead className="w-[90px]">{t.schedules.tablePriority}</TableHead>
                    <TableHead className="w-[160px]">{t.schedules.tableNextRun}</TableHead>
                    <TableHead className="w-[110px]">{t.schedules.tableStatus}</TableHead>
                    <TableHead className="w-[130px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((sched) => {
                    const isPaused = sched.is_paused === 1;
                    const nextRunDate = new Date(sched.next_run_at);

                    return (
                      <TableRow key={sched.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-semibold text-foreground">
                          {sched.id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 bg-muted/60 text-foreground">
                            {sched.cron}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-md truncate font-mono text-xs text-muted-foreground">
                            {sched.url}
                          </div>
                        </TableCell>
                        <TableCell>
                          {sched.priority >= 10 ? (
                            <Badge className="bg-rose-500/15 text-rose-500 hover:bg-rose-500/20 border-rose-500/30 text-[10px] py-0 px-1.5 font-semibold">
                              Urgente ({sched.priority})
                            </Badge>
                          ) : sched.priority >= 5 ? (
                            <Badge className="bg-amber-500/15 text-amber-500 hover:bg-amber-500/20 border-amber-500/30 text-[10px] py-0 px-1.5 font-semibold">
                              Alta ({sched.priority})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                              Normal
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {isPaused ? (
                            <span className="text-muted-foreground/60 italic">Pausado</span>
                          ) : (
                            <span className="text-foreground">
                              {nextRunDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                              <span className="text-[10px] text-muted-foreground">
                                ({nextRunDate.toLocaleDateString()})
                              </span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isPaused ? 'outline' : 'default'}
                            className={`text-[10px] py-0 px-2 font-medium ${
                              isPaused
                                ? 'border-amber-500/30 text-amber-500 bg-amber-500/10'
                                : 'bg-emerald-600/15 text-emerald-500 border-emerald-500/30'
                            }`}
                          >
                            {isPaused ? t.schedules.statusPaused : t.schedules.statusActive}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-pink-500 hover:bg-pink-500/10"
                              onClick={() => triggerMutation.mutate(sched.id)}
                              disabled={triggerMutation.isPending}
                              title={t.schedules.triggerBtn}
                            >
                              <Play className="size-3.5 fill-pink-500 text-pink-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() =>
                                togglePauseMutation.mutate({ id: sched.id, isPaused })
                              }
                              title={isPaused ? 'Retomar' : 'Pausar'}
                            >
                              {isPaused ? (
                                <Zap className="size-3.5 text-emerald-500" />
                              ) : (
                                <Pause className="size-3.5 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive hover:bg-destructive/10"
                              onClick={() => deleteMutation.mutate(sched.id)}
                              disabled={deleteMutation.isPending}
                              title={t.common.delete}
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

      {/* Dialog: Create Recurring Schedule */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-pink-500" />
              <span>{t.schedules.modalTitle}</span>
            </DialogTitle>
            <DialogDescription>{t.schedules.modalSubtitle}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sched-url">{t.schedules.urlLabel}</Label>
              <Input
                id="sched-url"
                placeholder={t.schedules.urlPlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="sched-cron">{t.schedules.cronLabel}</Label>
                <span className="text-[10px] text-muted-foreground">Sintaxe padrão 5 campos</span>
              </div>
              <Input
                id="sched-cron"
                placeholder={t.schedules.cronPlaceholder}
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                required
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {presets.map((p) => (
                  <button
                    key={p.cron}
                    type="button"
                    onClick={() => setCron(p.cron)}
                    className="text-[10px] px-2 py-0.5 rounded-md border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t.schedules.priorityLabel}</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={priority === 0 ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs h-8 ${priority === 0 ? 'bg-zinc-700 hover:bg-zinc-600' : ''}`}
                  onClick={() => setPriority(0)}
                >
                  Normal (0)
                </Button>
                <Button
                  type="button"
                  variant={priority === 5 ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs h-8 ${priority === 5 ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
                  onClick={() => setPriority(5)}
                >
                  Alta (5)
                </Button>
                <Button
                  type="button"
                  variant={priority === 10 ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs h-8 ${priority === 10 ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}`}
                  onClick={() => setPriority(10)}
                >
                  Urgente (10)
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-payload">{t.schedules.payloadLabel}</Label>
              <Textarea
                id="sched-payload"
                rows={4}
                className="font-mono text-xs"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !url.trim() || !cron.trim()}
                className="bg-pink-600 hover:bg-pink-700 text-white gap-2"
              >
                <Plus className="size-3.5" />
                <span>{createMutation.isPending ? 'Salvando...' : 'Criar Agendamento'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
