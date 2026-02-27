import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoggedOutLandingPage } from './pages/LoggedOutLandingPage'
import { LoggedInPage } from './pages/LoggedInPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { InvestmentsPage } from './pages/InvestmentsPage'
import { AccountsPage } from './pages/AccountsPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/TermsOfServicePage'

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
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
