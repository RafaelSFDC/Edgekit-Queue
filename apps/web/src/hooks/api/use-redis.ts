import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRedisKeys, setRedisKey, deleteRedisKey, flushRedis } from '../../services/api';
import { queryKeys } from './query-keys';
import { toast } from 'sonner';

export function useRedisKeysQuery(groupId: string = 'default') {
  return useQuery({
    queryKey: queryKeys.redis.group(groupId),
    queryFn: () => fetchRedisKeys(groupId),
    refetchInterval: 5000,
  });
}

export function useSetRedisKeyMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value, ttl }: { key: string; value: string; ttl?: number }) =>
      setRedisKey(key, value, ttl, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.redis.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('Chave salva com sucesso no Redis KV.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao gravar chave no Redis.');
    },
  });
}

export function useDeleteRedisKeyMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) => deleteRedisKey(key, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.redis.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('Chave removida do Redis.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao remover chave.');
    },
  });
}

export function useFlushRedisMutation(groupId: string = 'default') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => flushRedis(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.redis.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      toast.success('Banco de chaves Redis resetado com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao resetar banco Redis.');
    },
  });
}
