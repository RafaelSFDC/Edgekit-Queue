import React, { Suspense, lazy } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Navigate,
} from '@tanstack/react-router';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { useAuth } from './context/auth-context';
import { EdgekitLogo } from './components/common/EdgekitLogo';

// Lazy-loaded pages for optimized bundle size & fast initial paint
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const DlqPage = lazy(() => import('./pages/DlqPage').then((m) => ({ default: m.DlqPage })));
const LogsPage = lazy(() => import('./pages/LogsPage').then((m) => ({ default: m.LogsPage })));
const RedisPage = lazy(() => import('./pages/RedisPage').then((m) => ({ default: m.RedisPage })));
const SnippetsPage = lazy(() => import('./pages/SnippetsPage').then((m) => ({ default: m.SnippetsPage })));

const PageSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense
    fallback={
      <div className="flex h-64 w-full items-center justify-center text-xs text-muted-foreground animate-pulse">
        Carregando página...
      </div>
    }
  >
    {children}
  </Suspense>
);

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
  component: () => (
    <PageSuspense>
      <LoginPage />
    </PageSuspense>
  ),
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
  component: () => (
    <PageSuspense>
      <OverviewPage />
    </PageSuspense>
  ),
});

const messagesRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/messages',
  component: () => (
    <PageSuspense>
      <MessagesPage />
    </PageSuspense>
  ),
});

const dlqRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/dlq',
  component: () => (
    <PageSuspense>
      <DlqPage />
    </PageSuspense>
  ),
});

const logsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/logs',
  component: () => (
    <PageSuspense>
      <LogsPage />
    </PageSuspense>
  ),
});

const redisRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/redis',
  component: () => (
    <PageSuspense>
      <RedisPage />
    </PageSuspense>
  ),
});

const snippetsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/snippets',
  component: () => (
    <PageSuspense>
      <SnippetsPage />
    </PageSuspense>
  ),
});

// 5. Mount Route Tree
const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute.addChildren([
    indexRoute,
    messagesRoute,
    dlqRoute,
    logsRoute,
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
