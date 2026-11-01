import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bell, Sliders, Send, Save, CheckCircle } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { fetchQueueSettings, updateQueueSettings, testDlqAlert } from '../services/api';
import { toast } from 'sonner';
import type { QueueSettings } from '../types';

export const SettingsPage: React.FC = () => {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [maxConcurrency, setMaxConcurrency] = useState('10');
  const [dlqAlertUrl, setDlqAlertUrl] = useState('');

  const { data: settings, isLoading } = useQuery<QueueSettings>({
    queryKey: ['settings', 'default'],
    queryFn: () => fetchQueueSettings('default'),
  });

  useEffect(() => {
    if (settings) {
      setMaxConcurrency(String(settings.max_concurrent_deliveries || 10));
      setDlqAlertUrl(settings.dlq_alert_url || '');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateQueueSettings(
        {
          max_concurrent_deliveries: parseInt(maxConcurrency, 10) || 10,
          dlq_alert_url: dlqAlertUrl.trim() || null,
        },
        'default'
      ),
    onSuccess: () => {
      toast.success(t.settings.saveSuccess);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao salvar configurações');
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: () => testDlqAlert(dlqAlertUrl.trim(), 'default'),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t.settings.testAlertSuccess);
      } else {
        toast.error(`${t.settings.testAlertError}: ${res.error}`);
      }
    },
    onError: (err: any) => {
      toast.error(`${t.settings.testAlertError}: ${err.message}`);
    },
  });

  return (
    <PageLayout>
      <PageHeader
        title={t.settings.title}
        description={t.settings.subtitle}
      />

      <div className="grid gap-6 max-w-4xl">
        {/* Concurrency Settings Card */}
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="size-4 text-pink-500" />
              <CardTitle className="text-sm font-semibold">{t.settings.concurrencyTitle}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t.settings.concurrencyDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="max-concurrency" className="text-xs">
                {t.settings.concurrencyLabel}
              </Label>
              <Input
                id="max-concurrency"
                type="number"
                min="1"
                max="100"
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-[10px] text-muted-foreground">
                Padrão: 10 entregas simultâneas por grupo.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* DLQ Alert Webhook Card */}
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-pink-500" />
              <CardTitle className="text-sm font-semibold">{t.settings.dlqAlertTitle}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t.settings.dlqAlertDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dlq-alert-url" className="text-xs">
                {t.settings.dlqAlertLabel}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="dlq-alert-url"
                  placeholder={t.settings.dlqAlertPlaceholder}
                  value={dlqAlertUrl}
                  onChange={(e) => setDlqAlertUrl(e.target.value)}
                  disabled={isLoading}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => testAlertMutation.mutate()}
                  disabled={testAlertMutation.isPending || !dlqAlertUrl.trim()}
                  className="shrink-0 gap-1.5 text-xs h-9"
                >
                  <Send className="size-3.5" />
                  <span>{testAlertMutation.isPending ? 'Enviando...' : t.settings.testAlertBtn}</span>
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Compatível diretamente com webhooks do Discord, Slack (formato JSON padrão) ou qualquer endpoint HTTP.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t border-border/50 pt-4 flex justify-between items-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle className="size-3.5 text-emerald-500" />
              <span>Configurações salvas diretamente no SQLite do Durable Object.</span>
            </div>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || isLoading}
              className="bg-pink-600 hover:bg-pink-700 text-white gap-2 text-xs font-semibold h-9"
            >
              <Save className="size-4" />
              <span>{saveMutation.isPending ? 'Salvando...' : t.common.save}</span>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PageLayout>
  );
};
