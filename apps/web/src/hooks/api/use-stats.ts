import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStats, triggerSweep } from '../../services/api';
import { queryKeys } from './query-keys';
import { toast } from 'sonner';

export function useStatsQuery(groupId: string = 'default') {
  return useQuery({
    queryKey: queryKeys.stats.group(groupId),
    queryFn: () => fetchStats(groupId),
    refetchInterval: 5000,
  });
}

export function useTriggerSweepMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => triggerSweep(groupId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dlq.all });
      toast.success(`Varredura concluída! ${data.processed ?? 0} entregas acionadas.`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao executar varredura.');
    },
  });
}
