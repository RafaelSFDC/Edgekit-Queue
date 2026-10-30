import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDeliveryLogs, clearDeliveryLogs } from '../../services/api';
import { queryKeys } from './query-keys';
import { toast } from 'sonner';

export function useDeliveryLogsQuery(groupId: string = 'default') {
  return useQuery({
    queryKey: queryKeys.logs.group(groupId),
    queryFn: () => fetchDeliveryLogs(groupId),
    refetchInterval: 5000,
  });
}

export function useClearDeliveryLogsMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearDeliveryLogs(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.logs.all });
      toast.success('Logs de entrega limpos com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao limpar logs de entrega.');
    },
  });
}
