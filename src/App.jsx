/**
 * Root component: AuthProvider, Router, and route definitions.
 * Protected routes use Firebase auth; unauthenticated users redirect to /. See docs/ONBOARDING.md.
 */
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PlaidLinkProvider } from './context/PlaidLinkContext'
import { OnboardingModal } from './components/OnboardingModal'
import { useConnections } from './hooks/usePlaidQueries'
import queryClient from './lib/queryClient'
import { LoggedOutLandingPage } from './pages/LoggedOutLandingPage'
import { LoggedInPage } from './pages/LoggedInPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { InvestmentsPage } from './pages/InvestmentsPage'
import { AccountsPage } from './pages/AccountsPage'
import { CashFlowPage } from './pages/CashFlowPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/TermsOfServicePage'

function OnboardingGate({ children }) {
  const { user, ready } = useAuth()
  const { data: connectionsData, isLoading } = useConnections({ enabled: !!user })
  const connections = connectionsData?.connections ?? []
  const hasAccounts = connections.length > 0

  if (ready && !!user && !isLoading && !hasAccounts) return <OnboardingModal />
  return children
}

/** Redirects to / if not logged in; used for /app and sub-routes. */
function ProtectedRoute({ children }) {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center font-[Roboto,sans-serif] text-black/60">
        Loading…
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/" replace />
  }
  return children
}

/** Redirects to /app if already logged in; used for landing page. */
function LoggedOutOnly({ children }) {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center font-[Roboto,sans-serif] text-black/60">
        Loading…
      </div>
    )
  }
  if (user) return <Navigate to="/app" replace />
  return children
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

/** Route table: / (landing), /app/* (dashboard, transactions, investments, accounts), /privacy, /terms. */
function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LoggedOutOnly>
            <LoggedOutLandingPage />
          </LoggedOutOnly>
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <LoggedInPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/transactions"
        element={
          <ProtectedRoute>
            <TransactionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/cash-flow"
        element={
          <ProtectedRoute>
            <CashFlowPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/investments"
        element={
          <ProtectedRoute>
            <InvestmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/accounts"
        element={
          <ProtectedRoute>
            <AccountsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <PlaidLinkProvider>
            <ScrollToTop />
            <OnboardingGate>
              <AppRoutes />
            </OnboardingGate>
          </PlaidLinkProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
