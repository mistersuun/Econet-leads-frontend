import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, type ReactNode } from 'react'
import { ApiError } from './api/client'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import type { Role } from './api/types'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

// Route-level code splitting: charts (Recharts) only load with the dashboard.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CallPage = lazy(() => import('./pages/CallPage'))
const LeadsPage = lazy(() => import('./pages/LeadsPage'))
const LeadDetailDrawer = lazy(() => import('./pages/LeadDetailDrawer'))
const FollowUpsPage = lazy(() => import('./pages/FollowUpsPage'))
const SourcesPage = lazy(() => import('./pages/SourcesPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return count < 1
      },
    },
  },
})

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="call" element={<CallPage />} />
                <Route path="leads" element={<LeadsPage />}>
                  <Route path=":id" element={<LeadDetailDrawer />} />
                </Route>
                <Route path="follow-ups" element={<FollowUpsPage />} />
                <Route
                  path="sources"
                  element={
                    <RequireAuth roles={['ADMIN']}>
                      <SourcesPage />
                    </RequireAuth>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
