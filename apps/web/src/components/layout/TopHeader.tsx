import React from 'react';
import {
  Globe,
  Sun,
  Moon,
  LogOut,
  User,
  ExternalLink,
} from 'lucide-react';
import { EdgekitLogo } from '../common/EdgekitLogo';
import { useI18n } from '../../i18n/context';
import { useTheme } from '../../theme/context';
import { useAuth } from '../../context/auth-context';
import { useSidebar, SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface TopHeaderProps {
  clusterStatus?: 'online' | 'degraded';
}

export const TopHeader: React.FC<TopHeaderProps> = ({ clusterStatus = 'online' }) => {
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { state } = useSidebar();

  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const getBreadcrumbLabel = () => {
    switch (pathname) {
      case '/messages':
        return t.breadcrumbs.messages;
      case '/dlq':
        return t.breadcrumbs.dlq;
      case '/redis':
        return t.breadcrumbs.redis;
      case '/snippets':
        return t.breadcrumbs.snippets;
      case '/':
      default:
        return t.breadcrumbs.overview;
    }
  };

  const currentPage = getBreadcrumbLabel();

  return (
    <header className="sticky top-0 z-40 flex h-12 w-full border-b border-border bg-card/90 backdrop-blur-md select-none">
      {/* 1. Brand cell aligned with Sidebar */}
      <div
        className={cn(
          'flex h-full items-center border-r border-border bg-card transition-[width] duration-200 ease-in-out shrink-0',
          state === 'collapsed'
            ? 'w-[var(--sidebar-width-icon)] justify-center px-0'
            : 'w-full lg:w-[var(--sidebar-width)] justify-between px-3'
        )}
      >
        <Link to="/" className="flex items-center gap-2 overflow-hidden outline-hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-500 shadow-xs">
            <EdgekitLogo module="queue" size={20} />
          </div>

          {state !== 'collapsed' && (
            <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="font-bold tracking-tight text-foreground text-sm">Edgekit</span>
              <span className="font-semibold text-pink-500 text-sm">Queue</span>
              <span className="ml-1 rounded px-1.5 py-0.2 text-[10px] font-mono font-medium bg-muted text-muted-foreground border border-border">
                default
              </span>
            </div>
          )}
        </Link>

        <div className="lg:hidden">
          <SidebarTrigger />
        </div>
      </div>

      {/* 2. Top Right Bar with Breadcrumbs & Actions */}
      <div className="flex flex-1 items-center justify-between px-3 sm:px-4 gap-3 overflow-hidden">
        <div className="flex items-center gap-2 overflow-hidden">
          <SidebarTrigger className="hidden lg:flex shrink-0" />
          <Breadcrumb>
            <BreadcrumbList className="text-xs whitespace-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/" className="text-muted-foreground hover:text-foreground">
                    {t.breadcrumbs.overview}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>

              {pathname !== '/' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-foreground">
                      {currentPage}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Right side: Status + User Profile Menu */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium transition-colors select-none',
              clusterStatus === 'online'
                ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10'
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full shrink-0',
                clusterStatus === 'online'
                  ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse'
                  : 'bg-amber-500 dark:bg-amber-400'
              )}
            />
            <span>{clusterStatus === 'online' ? t.navbar.online : t.navbar.degraded}</span>
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full border border-border"
                />
              }
            >
              <User className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-xs font-semibold leading-none text-foreground">Edgekit Admin</p>
                  <p className="text-[11px] leading-none text-muted-foreground">SQLite DO Cluster</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem onClick={toggleTheme}>
                  {resolvedTheme === 'dark' ? (
                    <Sun className="mr-2 size-4 text-amber-500" />
                  ) : (
                    <Moon className="mr-2 size-4 text-sky-500" />
                  )}
                  <span>{resolvedTheme === 'dark' ? t.navbar.themeLight : t.navbar.themeDark}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => setLocale(locale === 'pt-BR' ? 'en' : 'pt-BR')}
                >
                  <Globe className="mr-2 size-4 text-emerald-500" />
                  <span>{locale === 'pt-BR' ? 'English (EN)' : 'Português (BR)'}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() =>
                  window.open('https://github.com/upstash/qstash-js', '_blank', 'noreferrer')
                }
              >
                <ExternalLink className="mr-2 size-4" />
                <span>{t.navbar.docs}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={logout}
              >
                <LogOut className="mr-2 size-4" />
                <span>{t.navbar.logout}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
