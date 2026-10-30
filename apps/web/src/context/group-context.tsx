import React, { createContext, useContext, useState, useEffect } from 'react';
import { useGroupsQuery } from '../hooks/api/use-groups';

interface GroupContextType {
  currentGroup: string;
  setCurrentGroup: (group: string) => void;
  groups: string[];
  isLoading: boolean;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

const STORAGE_KEY = 'edgekit_queue_current_group';

export const GroupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentGroup, setCurrentGroupState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || 'default';
    }
    return 'default';
  });

  const { data: groups = ['default'], isLoading } = useGroupsQuery();

  const setCurrentGroup = (group: string) => {
    const clean = group.trim().toLowerCase() || 'default';
    setCurrentGroupState(clean);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, clean);
    }
  };

  // Ensure currentGroup is in list if not already
  const allGroups = Array.from(new Set(['default', ...groups, currentGroup]));

  return (
    <GroupContext.Provider
      value={{
        currentGroup,
        setCurrentGroup,
        groups: allGroups,
        isLoading,
      }}
    >
      {children}
    </GroupContext.Provider>
  );
};

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) {
    throw new Error('useGroup must be used within a GroupProvider');
  }
  return ctx;
}
