import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMessages, deleteMessage, purgeMessages, publishMessage } from '../../services/api';
import type { PublishRequest } from '../../types';
import { queryKeys } from './query-keys';
import { toast } from 'sonner';

export function useMessagesQuery(groupId: string = 'default') {
  return useQuery({
    queryKey: queryKeys.messages.group(groupId),
    queryFn: () => fetchMessages(groupId),
    refetchInterval: 5000,
  });
}

export function useDeleteMessageMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMessage(id, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('Mensagem removida da fila.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao remover mensagem.');
    },
  });
}

export function usePurgeMessagesMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => purgeMessages(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('Fila de mensagens expurgada com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao expurgar mensagens.');
    },
  });
}

export function usePublishMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: PublishRequest) => publishMessage(req),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success(`Mensagem publicada! ID: ${data.messageId}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao publicar mensagem.');
    },
  });
}
