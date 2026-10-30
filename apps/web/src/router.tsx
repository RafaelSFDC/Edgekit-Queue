import React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Navigate,
} from '@tanstack/react-router';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { MessagesPage } from './pages/MessagesPage';
import { DlqPage } from './pages/DlqPage';
import { RedisPage } from './pages/RedisPage';
import { SnippetsPage } from './pages/SnippetsPage';
import { useAuth } from './context/auth-context';
import { EdgekitLogo } from './components/common/EdgekitLogo';

/**
 * Dashboard Guard Component:
 * If the user is unauthenticated, redirects to /login.
 */
const DashboardGuard: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background text-foreground gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-500 animate-pulse">
          <EdgekitLogo module="queue" size={28} />
        </div>
        <p className="text-xs text-muted-foreground animate-pulse">Carregando painel...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout />;
};

// 1. Root route
const rootRoute = createRootRoute({
  component: Outlet,
});

// 2. Public Login route
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// 3. Protected Dashboard Layout Route
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_dashboard',
  component: DashboardGuard,
});

// 4. Children routes
const indexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: OverviewPage,
});

const messagesRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/messages',
  component: MessagesPage,
});

const dlqRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/dlq',
  component: DlqPage,
});

const redisRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/redis',
  component: RedisPage,
});

const snippetsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/snippets',
  component: SnippetsPage,
});

// 5. Mount Route Tree
const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute.addChildren([
    indexRoute,
    messagesRoute,
    dlqRoute,
    redisRoute,
    snippetsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
