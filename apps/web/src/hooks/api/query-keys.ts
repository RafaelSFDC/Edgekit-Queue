export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  groups: {
    all: ['groups'] as const,
  },
  stats: {
    all: ['stats'] as const,
    group: (groupId: string) => ['stats', groupId] as const,
  },
  messages: {
    all: ['messages'] as const,
    group: (groupId: string) => ['messages', groupId] as const,
  },
  dlq: {
    all: ['dlq'] as const,
    group: (groupId: string) => ['dlq', groupId] as const,
  },
  logs: {
    all: ['logs'] as const,
    group: (groupId: string) => ['logs', groupId] as const,
  },
  redis: {
    all: ['redis'] as const,
    group: (groupId: string) => ['redis', groupId] as const,
  },
};
