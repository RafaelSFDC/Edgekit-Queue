import React from 'react';
import { Outlet } from '@tanstack/react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TopHeader } from './TopHeader';
import { AppSidebar } from './AppSidebar';
import { useStatsQuery } from '../../hooks/api/use-stats';

export const DashboardLayout: React.FC = () => {
  const { data: stats } = useStatsQuery();

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
        {/* Top Header with Breadcrumbs & Cluster status */}
        <TopHeader clusterStatus={stats?.cluster ?? 'online'} />

        {/* Body: Sidebar + Main Content Canvas */}
        <div className="flex flex-1 w-full">
          <AppSidebar />

          <main className="flex-1 min-w-0 flex flex-col bg-background/50">
            <div className="flex-1 w-full min-w-0 p-4 sm:p-6 flex flex-col">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
