import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDLQ, retryDLQ, deleteDLQ, purgeDLQ } from '../../services/api';
import { queryKeys } from './query-keys';
import { toast } from 'sonner';

export function useDLQQuery(groupId: string = 'default') {
  return useQuery({
    queryKey: queryKeys.dlq.group(groupId),
    queryFn: () => fetchDLQ(groupId),
    refetchInterval: 5000,
  });
}

export function useRetryDLQMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => retryDLQ(id, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dlq.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('Mensagem reinserida na fila para reprocessamento.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao reprocessar mensagem da DLQ.');
    },
  });
}

export function useDeleteDLQMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteDLQ(id, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dlq.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('Mensagem removida da DLQ.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao excluir mensagem da DLQ.');
    },
  });
}

export function usePurgeDLQMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => purgeDLQ(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dlq.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('DLQ limpa com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao limpar DLQ.');
    },
  });
}
