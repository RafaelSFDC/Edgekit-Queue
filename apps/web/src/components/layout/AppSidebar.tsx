import React, { useState } from 'react';
import {
  Home,
  Layers,
  AlertOctagon,
  Database,
  Code2,
  Search,
} from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useI18n } from '../../i18n/context';
import { useStatsQuery } from '../../hooks/api/use-stats';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const AppSidebar: React.FC = () => {
  const { t } = useI18n();
  const { state, toggleSidebar } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: stats } = useStatsQuery();

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const isCollapsed = state === 'collapsed';

  const matchesSearch = (label: string) => {
    if (!searchQuery.trim()) return true;
    return label.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const pendingCount = (stats?.pending || 0) + (stats?.delayed || 0) + (stats?.processing || 0);
  const dlqCount = stats?.dlq || 0;
  const kvCount = stats?.kvKeysCount || 0;

  const navItems = [
    {
      to: '/',
      label: t.sidebar.home,
      icon: <Home className="size-4 shrink-0" />,
      badge: undefined,
      badgeVariant: 'secondary' as const,
    },
    {
      to: '/messages',
      label: t.sidebar.messages,
      icon: <Layers className="size-4 shrink-0" />,
      badge: pendingCount > 0 ? pendingCount : undefined,
      badgeVariant: 'secondary' as const,
    },
    {
      to: '/dlq',
      label: t.sidebar.dlq,
      icon: <AlertOctagon className="size-4 shrink-0" />,
      badge: dlqCount > 0 ? dlqCount : undefined,
      badgeVariant: (dlqCount > 0 ? 'destructive' : 'secondary') as 'destructive' | 'secondary',
    },
    {
      to: '/redis',
      label: t.sidebar.redis,
      icon: <Database className="size-4 shrink-0" />,
      badge: kvCount > 0 ? kvCount : undefined,
      badgeVariant: 'secondary' as const,
    },
    {
      to: '/snippets',
      label: t.sidebar.snippets,
      icon: <Code2 className="size-4 shrink-0" />,
      badge: undefined,
      badgeVariant: 'secondary' as const,
    },
  ];

  return (
    <Sidebar collapsible="icon" className="select-none">
      {/* 1. Quick Search Bar */}
      <SidebarHeader className="border-b border-border/50 pb-2">
        {!isCollapsed ? (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.sidebar.quickSearch}
              className="w-full h-8 pl-8 pr-12 rounded-md bg-muted/50 border border-border/80 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
            <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-card border border-border/70 rounded">
              Ctrl K
            </kbd>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground mx-auto transition-colors"
                >
                  <Search className="size-4" />
                </button>
              }
            />
            <TooltipContent side="right">{t.sidebar.quickSearch}</TooltipContent>
          </Tooltip>
        )}
      </SidebarHeader>

      {/* 2. Menu Navigation */}
      <SidebarContent className="p-2">
        <SidebarMenu>
          {navItems
            .filter((item) => matchesSearch(item.label))
            .map((item) => {
              const isActive = currentPath === item.to;

              const buttonContent = (
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 font-semibold border border-pink-500/20'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Link to={item.to} className="w-full flex items-center gap-2.5">
                    {item.icon}
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </SidebarMenuButton>
              );

              return (
                <SidebarMenuItem key={item.to} className="relative">
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger render={buttonContent} />
                      <TooltipContent side="right">
                        <span>{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="ml-2 font-mono text-[10px] opacity-75">
                            ({item.badge})
                          </span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      {buttonContent}
                      {item.badge !== undefined && (
                        <SidebarMenuBadge
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium',
                            item.badgeVariant === 'destructive'
                              ? 'bg-destructive/15 text-destructive border border-destructive/30'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {item.badge}
                        </SidebarMenuBadge>
                      )}
                    </div>
                  )}
                </SidebarMenuItem>
              );
            })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
};
