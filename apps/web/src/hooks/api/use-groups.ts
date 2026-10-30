import { useQuery } from '@tanstack/react-query';
import { fetchGroups } from '../../services/api';
import { queryKeys } from './query-keys';

export function useGroupsQuery() {
  return useQuery({
    queryKey: queryKeys.groups.all,
    queryFn: fetchGroups,
    refetchInterval: 10000,
  });
}
